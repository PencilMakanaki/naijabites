// Lets the tests run the real catalogue SQL against an in-memory SQLite database,
// through the same execute(sql, params) shape that mysql2 uses.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function sqliteAvailable() {
  try { await import('node:sqlite'); return true; } catch { return false; }
}

export async function createSqlitePool({ withMarkets = true } = {}) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(fileURLToPath(new URL('./catalogue-schema.sql', import.meta.url)), 'utf8'));
  if (withMarkets) {
    // load the real market rows from the real migration, so a mistake in that file is caught too
    const migration = readFileSync(fileURLToPath(new URL('../../migrations/V006__catalogue.up.sql', import.meta.url)), 'utf8');
    db.exec(/INSERT INTO markets[\s\S]*?;/.exec(migration)[0]);
  }
  const bind = (params) => params.map((v) => {
    if (v === undefined) throw new Error('undefined SQL parameter');
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });
  const run = (sql, params = []) => {
    const statement = db.prepare(sql);
    if (/^\s*(SELECT|WITH)/i.test(sql)) return [statement.all(...bind(params)), undefined];
    const result = statement.run(...bind(params));
    return [{ insertId: Number(result.lastInsertRowid), affectedRows: Number(result.changes) }, undefined];
  };
  const conn = { execute: async (s, p) => run(s, p), query: async (s, p) => run(s, p) };
  return { ...conn, db, end: async () => {}, getConnection: async () => ({ ...conn, release() {} }) };
}
