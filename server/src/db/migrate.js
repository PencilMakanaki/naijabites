import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { SESSION_SQL } from './pool.js';
import { checksum, collectMigrations, planDown, planUp } from './migrate-core.js';

const DEFAULT_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));
const LOCK_NAME = 'naijabites_migrations';

async function loadAvailable(dir) {
  const files = await readdir(dir);
  const { migrations, problems } = collectMigrations(files);
  if (problems.length) throw new Error(`Problems in the migrations folder:\n  - ${problems.join('\n  - ')}`);
  const available = [];
  for (const m of migrations) {
    const upSql = await readFile(join(dir, m.up), 'utf8');
    available.push({ ...m, upChecksum: checksum(upSql) });
  }
  return available;
}

/** direction: 'up' | 'down' | 'status'. Uses the migrator database user. */
export async function runMigrations({ config, direction, dir = DEFAULT_DIR, log = console.log }) {
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.migrator.user,
    password: config.migrator.password,
    database: config.db.name,
    charset: 'utf8mb4',
    timezone: 'Z',
    multipleStatements: true,
  });
  try {
    await connection.query(SESSION_SQL);
    const [[lock]] = await connection.query('SELECT GET_LOCK(?, 10) AS got', [LOCK_NAME]);
    if (lock.got !== 1) throw new Error('Another migration is running. Try again in a moment.');
    await connection.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version INT UNSIGNED NOT NULL,
         name VARCHAR(100) NOT NULL,
         checksum CHAR(64) NOT NULL,
         applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
         PRIMARY KEY (version)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
    const [rows] = await connection.query('SELECT version, name, checksum FROM schema_migrations ORDER BY version');
    const applied = rows.map((r) => ({ version: r.version, name: r.name, checksum: r.checksum }));
    const available = await loadAvailable(dir);

    if (direction === 'status') {
      for (const m of available) {
        log(`${String(m.version).padStart(3, '0')}  ${m.name.padEnd(28)} ${applied.some((a) => a.version === m.version) ? 'applied' : 'pending'}`);
      }
      return;
    }

    if (direction === 'up') {
      const { pending, problems } = planUp(available, applied);
      if (problems.length) throw new Error(`Cannot continue:\n  - ${problems.join('\n  - ')}`);
      if (pending.length === 0) { log('Database is up to date.'); return; }
      for (const m of pending) {
        log(`Applying ${m.up} ...`);
        const sql = await readFile(join(dir, m.up), 'utf8');
        await connection.query(sql); // MySQL cannot undo structure changes, so keep each migration small
        await connection.query('INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)', [m.version, m.name, m.upChecksum]);
      }
      log('Done.');
      return;
    }

    if (direction === 'down') {
      const version = planDown(applied);
      if (version === null) { log('Nothing to roll back.'); return; }
      const m = available.find((x) => x.version === version);
      if (!m) throw new Error(`Migration ${version} is missing from disk.`);
      log(`Rolling back ${m.up} ...`);
      const sql = await readFile(join(dir, m.down), 'utf8');
      await connection.query(sql);
      await connection.query('DELETE FROM schema_migrations WHERE version = ?', [version]);
      log('Done.');
      return;
    }

    throw new Error(`Unknown command "${direction}". Use up, down or status.`);
  } finally {
    try { await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]); } catch { /* connection may be closed */ }
    await connection.end();
  }
}
