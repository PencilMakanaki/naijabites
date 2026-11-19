import mysql from 'mysql2/promise';

export const SESSION_SQL =
  "SET SESSION time_zone = '+00:00', sql_mode = 'ONLY_FULL_GROUP_BY,STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'";

export function createPool(config, { connectionLimit = 10 } = {}) {
  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.name,
    charset: 'utf8mb4',
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0,
    enableKeepAlive: true,
    supportBigNumbers: true,
    decimalNumbers: true,
    namedPlaceholders: false,
  });
  // Every connection speaks UTC and uses strict mode, whatever the server default is.
  pool.pool.on('connection', (connection) => {
    connection.query(SESSION_SQL, (err) => {
      if (err) console.error('Could not apply session settings:', err.message);
    });
  });
  return pool;
}

/** Runs fn(connection) inside a transaction. Retries on deadlock. */
export async function withTransaction(pool, fn, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await fn(connection);
      await connection.commit();
      return result;
    } catch (err) {
      try { await connection.rollback(); } catch { /* connection already broken */ }
      if (err?.errno === 1213 && attempt < retries) continue; // deadlock: try again
      throw err;
    } finally {
      connection.release();
    }
  }
}
