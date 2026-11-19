// Runs the real catalogue SQL (against SQLite, through the same execute() shape as MySQL).
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SEED_PRODUCTS, SEED_VENDORS } from '../src/catalogue/seedData.js';
import { seedCatalogue } from '../src/catalogue/seed.js';
import { buildProductsQuery, createCatalogue, decodeCursor, encodeCursor, escapeLike } from '../src/catalogue/queries.js';
import { createSqlitePool, sqliteAvailable } from './helpers/sqlitePool.js';

const hasSqlite = await sqliteAvailable();
const t = (name, fn) => test(name, { skip: !hasSqlite && 'node:sqlite is not available in this Node version' }, fn);

let pool; let catalogue;
before(async () => {
  if (!hasSqlite) return;
  pool = await createSqlitePool();
  await seedCatalogue(pool);
  catalogue = createCatalogue({ pool, dialect: 'sqlite' });
});

async function allPages(filters) {
  const items = []; let cursor; let pages = 0;
  do {
    const page = await catalogue.listProducts({ ...filters, cursor });
    items.push(...page.items); cursor = page.nextCursor; pages += 1;
    assert.ok(pages < 50, 'paging must end');
  } while (cursor);
  return { items, pages };
}

t('the sample seed is complete and safe to run twice', async () => {
  const again = await seedCatalogue(pool);
  assert.deepEqual(again, { categories: 0, vendors: 0, products: 0, skipped: SEED_PRODUCTS.length });
  assert.equal(pool.db.prepare('SELECT COUNT(*) AS n FROM vendors').get().n, SEED_VENDORS.length);
  assert.equal(pool.db.prepare("SELECT COUNT(*) AS n FROM users WHERE password_hash = '!sample-account-no-login'").get().n, SEED_VENDORS.length);
});

t('markets come from the migration in the original order', async () => {
  const markets = await catalogue.listMarkets();
  assert.deepEqual(markets.map((m) => m.code), ['breakfast', 'lunch', 'dinner', 'buka', 'groceries', 'livestock']);
  assert.deepEqual(markets.filter((m) => m.isMain).map((m) => m.name), ['Cafés & Bakeries', 'Fast Food', 'Dining']);
  assert.equal(markets[2].heading, 'Dining Menus Near You');
  assert.equal(markets[2].icon, '🍽️');
});

t('paging walks every product exactly once, newest first', async () => {
  const { items, pages } = await allPages({ sort: 'newest', limit: 5 });
  assert.equal(items.length, SEED_PRODUCTS.length);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  assert.ok(pages >= 5);
  const first = await catalogue.listProducts({ sort: 'newest', limit: 5 });
  assert.equal(first.items.length, 5);
  assert.ok(first.nextCursor);
  const whole = await catalogue.listProducts({ sort: 'newest', limit: 50 });
  assert.equal(whole.nextCursor, null);
  assert.deepEqual(items.map((i) => i.id), whole.items.map((i) => i.id));
});

t('price sorting is correct across page boundaries, even with equal prices', async () => {
  const asc = (await allPages({ sort: 'price_asc', limit: 4 })).items.map((i) => i.priceKobo);
  const desc = (await allPages({ sort: 'price_desc', limit: 4 })).items.map((i) => i.priceKobo);
  assert.equal(asc.length, SEED_PRODUCTS.length); assert.equal(desc.length, SEED_PRODUCTS.length);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
  const ids = (await allPages({ sort: 'price_asc', limit: 3 })).items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

t('market filter returns only that market, and livestock is quote-only', async () => {
  for (const market of ['breakfast', 'lunch', 'dinner', 'buka', 'groceries', 'livestock']) {
    const { items } = await allPages({ market, limit: 50 });
    assert.ok(items.length > 0, `${market} has items`);
    assert.ok(items.every((i) => i.markets.includes(market)), `${market} filter is exact`);
  }
  const livestock = (await allPages({ market: 'livestock', limit: 50 })).items;
  assert.ok(livestock.every((i) => i.fulfilmentMode === 'quote_required'));
  assert.equal((await catalogue.listProducts({ market: 'no_such_market', limit: 5 })).items.length, 0);
});

t('vendor and category filters', async () => {
  const mama = (await catalogue.listProducts({ vendor: 'mama-africa-kitchen', limit: 50 })).items;
  assert.ok(mama.length > 0 && mama.every((i) => i.vendor.slug === 'mama-africa-kitchen'));
  const main = (await catalogue.listProducts({ category: 'main-dishes', limit: 50 })).items;
  assert.ok(main.length > 0);
  assert.equal((await catalogue.listProducts({ category: 'nonexistent', limit: 50 })).items.length, 0);
});

t('search matches name, vendor and description, ignoring case, and treats % and _ as plain text', async () => {
  const jollof = (await catalogue.listProducts({ q: 'JOLLOF', limit: 50 })).items;
  assert.ok(jollof.length > 0 && jollof.every((i) => /jollof/i.test(`${i.name} ${i.description} ${i.vendor.name}`)));
  const byVendor = (await catalogue.listProducts({ q: 'mama africa', limit: 50 })).items;
  assert.ok(byVendor.some((i) => i.vendor.slug === 'mama-africa-kitchen'));
  for (const wild of ['%', '_', '%%', "o'brien", '"; DROP TABLE products; --', '\\']) {
    assert.equal((await catalogue.listProducts({ q: wild, limit: 50 })).items.length, 0, `q=${wild}`);
  }
  assert.equal(pool.db.prepare('SELECT COUNT(*) AS n FROM products').get().n, SEED_PRODUCTS.length);
});

t('hidden things never appear', async () => {
  const { items } = await catalogue.listProducts({ limit: 50 });
  const target = items[0]; const id = pool.db.prepare('SELECT id FROM products WHERE public_id = ?').get(target.id).id;
  const attempts = [
    ['unpublished', 'UPDATE products SET is_published = 0 WHERE id = ?', 'UPDATE products SET is_published = 1 WHERE id = ?'],
    ['unavailable', 'UPDATE products SET is_available = 0 WHERE id = ?', 'UPDATE products SET is_available = 1 WHERE id = ?'],
    ['hidden by admin', "UPDATE products SET moderation_status = 'hidden_by_admin' WHERE id = ?", "UPDATE products SET moderation_status = 'ok' WHERE id = ?"],
    ['deleted', "UPDATE products SET deleted_at = '2026-01-01' WHERE id = ?", 'UPDATE products SET deleted_at = NULL WHERE id = ?'],
  ];
  for (const [label, hide, restore] of attempts) {
    pool.db.prepare(hide).run(id);
    assert.ok(!(await catalogue.listProducts({ limit: 50 })).items.some((i) => i.id === target.id), `${label}: not listed`);
    assert.equal(await catalogue.getProduct(target.id), null, `${label}: no detail page`);
    pool.db.prepare(restore).run(id);
  }
  // a vendor that is not approved hides all of its products
  const vendorRow = pool.db.prepare('SELECT v.id, v.slug FROM vendors v JOIN products p ON p.vendor_id = v.id WHERE p.id = ?').get(id);
  pool.db.prepare("UPDATE vendors SET status = 'suspended' WHERE id = ?").run(vendorRow.id);
  assert.equal((await catalogue.listProducts({ vendor: vendorRow.slug, limit: 50 })).items.length, 0);
  assert.equal(await catalogue.getVendor(vendorRow.slug), null);
  assert.ok(!(await catalogue.listVendors()).some((v) => v.slug === vendorRow.slug));
  pool.db.prepare("UPDATE vendors SET status = 'approved' WHERE id = ?").run(vendorRow.id);
  // a product without a picture is never shown
  const saved = pool.db.prepare('SELECT * FROM product_images WHERE product_id = ?').all(id);
  pool.db.prepare('DELETE FROM product_images WHERE product_id = ?').run(id);
  assert.ok(!(await catalogue.listProducts({ limit: 50 })).items.some((i) => i.id === target.id));
  for (const img of saved) pool.db.prepare('INSERT INTO product_images (product_id, external_url, alt_text, sort_order, is_primary) VALUES (?, ?, ?, ?, ?)').run(id, img.external_url, img.alt_text, img.sort_order, img.is_primary);
  assert.ok((await catalogue.listProducts({ limit: 50 })).items.some((i) => i.id === target.id), 'visible again after restoring');
});

t('product detail has images, branches and vendor details', async () => {
  const [first] = (await catalogue.listProducts({ limit: 1 })).items;
  const detail = await catalogue.getProduct(first.id);
  assert.equal(detail.id, first.id);
  assert.ok(detail.images.length >= 1 && detail.images[0].url.startsWith('http'));
  assert.equal(detail.branches[0].name, 'Main branch');
  assert.match(detail.vendor.description, /sample vendor/);
  assert.equal(await catalogue.getProduct('01ZZZZZZZZZZZZZZZZZZZZZZZZ'), null);
});

t('stored pictures get the media address in front', async () => {
  const id = pool.db.prepare('SELECT id FROM products LIMIT 1').get().id;
  pool.db.prepare('DELETE FROM product_images WHERE product_id = ?').run(id);
  pool.db.prepare("INSERT INTO product_images (product_id, storage_key, is_primary) VALUES (?, 'p/abc.webp', 1)").run(id);
  const row = pool.db.prepare('SELECT public_id FROM products WHERE id = ?').get(id);
  const detail = await catalogue.getProduct(row.public_id);
  assert.equal(detail.image.url, '/media/p/abc.webp');
});

t('vendor pages and the vendor list', async () => {
  const vendor = await catalogue.getVendor('taste-hub');
  assert.equal(vendor.name, 'Taste Hub');
  assert.equal(vendor.productCount, (await catalogue.listProducts({ vendor: 'taste-hub', limit: 50 })).items.length);
  assert.equal(vendor.branches.length, 1);
  assert.equal(await catalogue.getVendor('no-such-vendor'), null);
  assert.equal((await catalogue.listVendors()).length, SEED_VENDORS.length);
  assert.deepEqual((await catalogue.listVendors({ q: 'taste' })).map((v) => v.slug), ['taste-hub']);
});

t('suggestions complete vendor and product names', async () => {
  const out = await catalogue.suggest('ma');
  assert.ok(out.some((s) => s.type === 'vendor' && s.text === 'Mama Africa Kitchen' && s.slug === 'mama-africa-kitchen'));
  assert.ok(out.length <= 8);
  assert.deepEqual(await catalogue.suggest('zzzzzz'), []);
  assert.deepEqual(await catalogue.suggest('%'), []);
});

test('bad page markers are rejected cleanly', () => {
  for (const bad of ['', 'abc', Buffer.from('{}').toString('base64url'), Buffer.from('{"i":-1}').toString('base64url'), Buffer.from('{"i":"x"}').toString('base64url')]) {
    assert.throws(() => decodeCursor(bad, 'newest'), { code: 'bad_cursor' });
  }
  assert.throws(() => decodeCursor(Buffer.from('{"i":5}').toString('base64url'), 'price_asc'), { code: 'bad_cursor' });
  const row = { id: 12, price_kobo: 650000 };
  assert.deepEqual(decodeCursor(encodeCursor(row, 'price_desc'), 'price_desc'), { i: 12, p: 650000 });
});

test('the SQL is built safely for MySQL', () => {
  const { sql, params } = buildProductsQuery({ q: '50%_off', market: 'dinner', limit: 20, sort: 'newest' }, { dialect: 'mysql' });
  assert.match(sql, /ESCAPE '\\\\'/);
  assert.match(sql, /LIMIT 21$/);
  assert.ok(!/OFFSET/i.test(sql));
  assert.ok(!sql.includes('50%'), 'user text is never put into the SQL itself');
  assert.deepEqual(params, ['dinner', '%50\\%\\_off%', '%50\\%\\_off%', '%50\\%\\_off%']);
  assert.equal(escapeLike('a\\b%c_d'), 'a\\\\b\\%c\\_d');
});

test('the SQLite test schema has the same columns as the real MySQL migration', { skip: !hasSqlite }, async () => {
  const migration = readFileSync(fileURLToPath(new URL('../migrations/V006__catalogue.up.sql', import.meta.url)), 'utf8');
  const tables = [...migration.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\) ENGINE/g)];
  assert.equal(tables.length, 7);
  for (const [, name, body] of tables) {
    const columns = body.split('\n').map((l) => /^ {2}([a-z_]+) [A-Z]/.exec(l)).filter(Boolean).map((m) => m[1])
      .filter((c) => !['primary', 'unique', 'key', 'constraint', 'fulltext'].includes(c));
    const twin = pool.db.prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name);
    assert.deepEqual([...columns].sort(), [...twin].sort(), `table ${name}`);
  }
});
