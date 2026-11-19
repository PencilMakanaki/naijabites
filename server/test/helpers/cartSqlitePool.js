import { createSqlitePool } from './sqlitePool.js';

export async function createCartSqlitePool() {
  const base = await createSqlitePool({ withMarkets: false });
  const { db } = base;

  db.exec(`
    CREATE TABLE carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 50),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (cart_id, product_id)
    );

    CREATE TABLE branch_product_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      stock_on_hand INTEGER NOT NULL DEFAULT 0,
      UNIQUE(branch_id, product_id)
    );

    CREATE TABLE stock_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      order_item_id INTEGER,
      vendor_id INTEGER,
      branch_id INTEGER,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_test_stock_reservations_product
      ON stock_reservations(product_id, status, expires_at);

    CREATE TABLE payment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      status TEXT NOT NULL
    );
  `);

  function adapt(sql) {
    let query = sql.replace(/\s+FOR UPDATE\b/gi, '');

    query = query.replace(
      /UTC_TIMESTAMP\(3\)/gi,
      'CURRENT_TIMESTAMP'
    );

    query = query.replace(
      /INSERT INTO carts \(user_id\)\s*VALUES \(\?\)\s*ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID\(id\)/i,
      'INSERT INTO carts (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING'
    );

   // Adapt MySQL DELETE JOIN for SQLite: remove one cart product.
query = query.replace(
  /DELETE\s+ci\s+FROM\s+cart_items\s+ci\s+JOIN\s+carts\s+c\s+ON\s+c\.id\s*=\s*ci\.cart_id\s+JOIN\s+products\s+p\s+ON\s+p\.id\s*=\s*ci\.product_id\s+WHERE\s+c\.user_id\s*=\s*\?\s+AND\s+p\.public_id\s*=\s*\?/i,
  `DELETE FROM cart_items
   WHERE id IN (
     SELECT ci.id
     FROM cart_items ci
     JOIN carts c ON c.id = ci.cart_id
     JOIN products p ON p.id = ci.product_id
     WHERE c.user_id = ? AND p.public_id = ?
   )`
);

// Adapt MySQL DELETE JOIN for SQLite: clear the user's cart.
query = query.replace(
  /DELETE\s+ci\s+FROM\s+cart_items\s+ci\s+JOIN\s+carts\s+c\s+ON\s+c\.id\s*=\s*ci\.cart_id\s+WHERE\s+c\.user_id\s*=\s*\?/i,
  `DELETE FROM cart_items
   WHERE id IN (
     SELECT ci.id
     FROM cart_items ci
     JOIN carts c ON c.id = ci.cart_id
     WHERE c.user_id = ?
   )`
); 

    query = query.replace(
      /ON DUPLICATE KEY UPDATE\s+quantity\s*=\s*VALUES\(quantity\)/i,
      'ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = excluded.quantity'
    );

    return query;
  }

  const execute = async (sql, params = []) => {
    const query = adapt(sql);
    const statement = db.prepare(query);

    const values = params.map((value) =>
      typeof value === 'boolean' ? Number(value) : value
    );

    if (/^\s*(SELECT|WITH)\b/i.test(query)) {
      return [statement.all(...values), undefined];
    }

    const result = statement.run(...values);

    return [{
      insertId: Number(result.lastInsertRowid),
      affectedRows: Number(result.changes),
    }, undefined];
  };

  const connection = {
    execute,
    query: execute,
    beginTransaction: async () => db.exec('BEGIN'),
    commit: async () => db.exec('COMMIT'),
    rollback: async () => db.exec('ROLLBACK'),
    release: () => {},
  };

  return {
    execute,
    query: execute,
    getConnection: async () => connection,
    end: async () => db.close(),
    db,
  };
}
