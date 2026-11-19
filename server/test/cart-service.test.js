import test from 'node:test';
import assert from 'node:assert/strict';

import { createCartSqlitePool } from './helpers/cartSqlitePool.js';
import { createCartService } from '../src/cart/service.js';

const PRODUCT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

async function setup() {
  const pool = await createCartSqlitePool();

  pool.db.exec(`
    INSERT INTO vendors (
      id, public_id, owner_user_id, business_name, slug, status
    ) VALUES (
      1, '01ARZ3NDEKTSV4RRFFQ69G5FAW',
      1, 'Test Vendor', 'test-vendor', 'approved'
    );

    INSERT INTO products (
      id, public_id, vendor_id, name, price_kobo,
      unit, fulfilment_mode, is_published, is_available,
      moderation_status, track_stock, stock_on_hand,
      max_per_order
    ) VALUES (
      1, '${PRODUCT_ID}', 1, 'Test Rice', 250000,
      'bag', 'standard', 1, 1, 'ok', 1, 5, 5
    );

    INSERT INTO product_images (
      product_id, external_url, alt_text, is_primary
    ) VALUES (
      1, 'https://example.com/rice.jpg', 'Rice image', 1
    );
  `);

  return {
    pool,
    cart: createCartService({ pool }),
  };
}

test('cart starts empty', async () => {
  const { pool, cart } = await setup();

  try {
    const result = await cart.get(1);

    assert.deepEqual(result, {
      items: [],
      itemCount: 0,
      subtotalKobo: 0,
    });
  } finally {
    await pool.end();
  }
});

test('adding a product creates a cart item', async () => {
  const { pool, cart } = await setup();

  try {
    const result = await cart.add(1, PRODUCT_ID, 2);

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].name, 'Test Rice');
    assert.equal(result.items[0].quantity, 2);
    assert.equal(result.items[0].unitPriceKobo, 250000);
    assert.equal(result.items[0].lineTotalKobo, 500000);
    assert.equal(result.itemCount, 2);
    assert.equal(result.subtotalKobo, 500000);
    assert.equal(result.items[0].available, true);
  } finally {
    await pool.end();
  }
});

test('adding the same product increases its quantity', async () => {
  const { pool, cart } = await setup();

  try {
    await cart.add(1, PRODUCT_ID, 2);
    const result = await cart.add(1, PRODUCT_ID, 1);

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].quantity, 3);
    assert.equal(result.itemCount, 3);
    assert.equal(result.subtotalKobo, 750000);
  } finally {
    await pool.end();
  }
});

test('adding more than available stock is rejected', async () => {
  const { pool, cart } = await setup();

  try {
    await assert.rejects(
      cart.add(1, PRODUCT_ID, 6),
      (error) => error.code === 'cart_quantity_limit'
    );

    const result = await cart.get(1);
    assert.equal(result.itemCount, 0);
  } finally {
    await pool.end();
  }
});

test('setting quantity updates an existing item', async () => {
  const { pool, cart } = await setup();

  try {
    await cart.add(1, PRODUCT_ID, 2);
    const result = await cart.setQuantity(1, PRODUCT_ID, 4);

    assert.equal(result.items[0].quantity, 4);
    assert.equal(result.itemCount, 4);
    assert.equal(result.subtotalKobo, 1000000);
  } finally {
    await pool.end();
  }
});

test('removing a product removes it from the cart', async () => {
  const { pool, cart } = await setup();

  try {
    await cart.add(1, PRODUCT_ID, 2);
    const result = await cart.remove(1, PRODUCT_ID);

    assert.equal(result.items.length, 0);
    assert.equal(result.itemCount, 0);
    assert.equal(result.subtotalKobo, 0);
  } finally {
    await pool.end();
  }
});

test('clearing the cart removes all items', async () => {
  const { pool, cart } = await setup();

  try {
    await cart.add(1, PRODUCT_ID, 2);
    const result = await cart.clear(1);

    assert.deepEqual(result, {
      items: [],
      itemCount: 0,
      subtotalKobo: 0,
    });
  } finally {
    await pool.end();
  }
});

test('unpublished products cannot be added', async () => {
  const { pool, cart } = await setup();

  try {
    pool.db.exec(`
      UPDATE products SET is_published = 0 WHERE id = 1;
    `);

    await assert.rejects(
      cart.add(1, PRODUCT_ID, 1),
      (error) => error.status === 404
    );
  } finally {
    await pool.end();
  }
});
test('cart quantity limits use active branch stock when branch inventory exists', async () => {
  const { pool, cart } = await setup();

  try {
    pool.db.exec(`
      INSERT INTO vendor_branches (id, vendor_id, name, address_line, area, city, is_active) VALUES (1, 1, 'Main', '1 Main Road', 'Ikeja', 'Lagos', 1);
      INSERT INTO branch_product_inventory (vendor_id, branch_id, product_id, stock_on_hand)
      VALUES (1, 1, 1, 2);
    `);

    await assert.rejects(
      cart.add(1, PRODUCT_ID, 3),
      (error) => error.code === 'cart_quantity_limit',
    );
    const result = await cart.add(1, PRODUCT_ID, 2);
    assert.equal(result.items[0].available, true);
    assert.equal(result.items[0].quantity, 2);
  } finally {
    await pool.end();
  }
});

test('cart availability subtracts reservations belonging to the same branch', async () => {
  const { pool, cart } = await setup();

  try {
    pool.db.exec(`
      INSERT INTO vendor_branches (id, vendor_id, name, address_line, area, city, is_active) VALUES (1, 1, 'Main', '1 Main Road', 'Ikeja', 'Lagos', 1);
      INSERT INTO branch_product_inventory (vendor_id, branch_id, product_id, stock_on_hand)
      VALUES (1, 1, 1, 5);
      INSERT INTO stock_reservations (vendor_id, branch_id, product_id, quantity, status, expires_at)
      VALUES (1, 1, 1, 4, 'active', datetime('now', '+1 hour'));
    `);

    await assert.rejects(
      cart.add(1, PRODUCT_ID, 2),
      (error) => error.code === 'cart_quantity_limit',
    );
    const result = await cart.get(1);
    assert.equal(result.items.length, 0);
  } finally {
    await pool.end();
  }
});

test('inactive branch stock is not exposed as cart availability', async () => {
  const { pool, cart } = await setup();

  try {
    pool.db.exec(`
      INSERT INTO vendor_branches (id, vendor_id, name, address_line, area, city, is_active) VALUES (1, 1, 'Closed', '1 Main Road', 'Ikeja', 'Lagos', 0);
      INSERT INTO branch_product_inventory (vendor_id, branch_id, product_id, stock_on_hand)
      VALUES (1, 1, 1, 5);
    `);

    await assert.rejects(
      cart.add(1, PRODUCT_ID, 1),
      (error) => error.code === 'cart_quantity_limit',
    );
  } finally {
    await pool.end();
  }
});
