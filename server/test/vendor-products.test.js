import test from 'node:test';
import assert from 'node:assert/strict';
import { createVendorProductService } from '../src/catalogue/vendorProducts.js';

function makePool({ status = 'approved', moderation = 'ok' } = {}) {
  const calls = [];
  const pool = { calls, async execute(sql, params = []) {
    calls.push({ sql, params });
    if (sql.includes('FROM vendors')) return [[{ id: 8, status }], []];
    if (sql.includes('FROM categories')) return [[{ id: 2 }], []];
    if (sql.includes('SELECT moderation_status')) return [[{ moderation_status: moderation }], []];
    if (sql.includes('SELECT id FROM products')) return [[{ id: 3 }], []];
    if (sql.startsWith('INSERT INTO products')) return [{ affectedRows: 1 }, []];
    if (sql.startsWith('UPDATE products')) return [{ affectedRows: 1 }, []];
    if (sql.includes('SELECT p.public_id')) return [[{ public_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', name: 'Jollof Rice', description: null, price_kobo: 250000, unit: 'plate', category_id: 2, category_name: 'Meals', is_published: 0, is_available: 1, max_per_order: 20, created_at: null, updated_at: null }], []];
    return [[], []];
  } };
  return pool;
}
const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

test('creates products as unpublished drafts', async () => {
  const pool = makePool(); const service = createVendorProductService({ pool });
  const product = await service.create(44, { name: 'Jollof Rice', priceKobo: 250000, unit: 'plate' });
  assert.equal(product.name, 'Jollof Rice');
  const insert = pool.calls.find((c) => c.sql.startsWith('INSERT INTO products'));
  assert.match(insert.sql, /VALUES \(\?, \?, \?, \?, \?, \?, \?, 0, 1, \?\)/);
  assert.equal(insert.params[1], 8);
});
test('blocks product management for unapproved vendors', async () => {
  const service = createVendorProductService({ pool: makePool({ status: 'pending' }) });
  await assert.rejects(() => service.list(44), { code: 'conflict' });
});
test('updates are scoped to the authenticated vendor', async () => {
  const pool = makePool(); const service = createVendorProductService({ pool });
  await service.update(44, id, { priceKobo: 300000 });
  const update = pool.calls.find((c) => c.sql.startsWith('UPDATE products'));
  assert.match(update.sql, /WHERE public_id = \? AND vendor_id = \? AND deleted_at IS NULL/);
  assert.deepEqual(update.params.slice(-2), [id, 8]);
});
test('blocks publishing products restricted by moderation', async () => {
  const service = createVendorProductService({ pool: makePool({ moderation: 'hidden_by_admin' }) });
  await assert.rejects(() => service.setPublished(44, id, true), { code: 'conflict' });
});
test('rejects invalid product data before insert', async () => {
  const pool = makePool(); const service = createVendorProductService({ pool });
  await assert.rejects(() => service.create(44, { name: 'x', priceKobo: -5 }), { code: 'validation_failed' });
  assert.equal(pool.calls.some((c) => c.sql.startsWith('INSERT INTO products')), false);
});
