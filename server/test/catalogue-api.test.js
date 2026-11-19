// The public storefront API, through the real app (validation, headers, errors), and share previews.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { createCatalogue } from '../src/catalogue/queries.js';
import { seedCatalogue } from '../src/catalogue/seed.js';
import { loadConfig } from '../src/config.js';
import { injectMeta } from '../src/http/pageMeta.js';
import { createLogger } from '../src/logger.js';
import { createSqlitePool, sqliteAvailable } from './helpers/sqlitePool.js';

const hasSqlite = await sqliteAvailable();
const t = (name, fn) => test(name, { skip: !hasSqlite && 'node:sqlite is not available in this Node version' }, fn);

let server; let base; let pool;
const freePort = () => new Promise((resolve) => { const p = net.createServer().listen(0, () => { const { port } = p.address(); p.close(() => resolve(port)); }); });
const get = async (path, headers = {}) => {
  const r = await fetch(`${base}${path}`, { headers });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text, headers: r.headers };
};

function makeDist() {
  const dir = mkdtempSync(join(tmpdir(), 'nb-dist-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><meta name="description" content="NaijaBites: default" /><title>NaijaBites</title></head><body><div id="root"></div></body></html>');
  return dir;
}

beforeEach(async () => {
  if (!hasSqlite) return;
  const port = await freePort(); base = `http://localhost:${port}`;
  const config = loadConfig({ NODE_ENV: 'test', PORT: String(port), APP_ORIGIN: base, DB_NAME: 'x', DB_USER: 'x', DB_PASSWORD: 'x', CSRF_SECRET: 'unit-test-secret-unit-test-secret-1234', LOG_LEVEL: 'silent' });
  pool = await createSqlitePool(); await seedCatalogue(pool);
  const catalogue = createCatalogue({ pool, dialect: 'sqlite' });
  server = createApp({ config, logger: createLogger(config), pool, catalogue, clientDir: makeDist() }).listen(port);
  await new Promise((resolve) => server.once('listening', resolve));
});
afterEach(async () => { if (server) await new Promise((resolve) => server.close(resolve)); server = null; });

t('markets and categories', async () => {
  const markets = await get('/api/v1/markets');
  assert.equal(markets.status, 200); assert.equal(markets.json.data.length, 6);
  assert.equal(markets.headers.get('cache-control'), 'no-store');
  assert.equal((await get('/api/v1/categories')).json.data.length, 6);
});

t('product list: paging, filters and sorting through the API', async () => {
  const first = await get('/api/v1/products?limit=5');
  assert.equal(first.status, 200); assert.equal(first.json.data.length, 5);
  assert.ok(first.json.meta.nextCursor);
  const second = await get(`/api/v1/products?limit=5&cursor=${first.json.meta.nextCursor}`);
  assert.equal(second.status, 200);
  assert.ok(!second.json.data.some((p) => first.json.data.some((q) => q.id === p.id)));
  const dinner = await get('/api/v1/products?market=dinner&sort=price_desc&limit=50');
  const prices = dinner.json.data.map((p) => p.priceKobo);
  assert.deepEqual(prices, [...prices].sort((a, b) => b - a));
  const found = await get('/api/v1/products?q=jollof&limit=50');
  assert.ok(found.json.data.length > 0);
  const p = first.json.data[0];
  assert.deepEqual(Object.keys(p).sort(), ['badge', 'description', 'fulfilmentMode', 'id', 'image', 'markets', 'name', 'priceKobo', 'unit', 'vendor']);
  assert.match(p.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
});

t('product list rejects bad input with field messages', async () => {
  for (const q of ['limit=0', 'limit=1000', 'limit=abc', 'sort=nearest', 'market=A', 'vendor=../etc', 'q=' + 'a'.repeat(81), 'unknown=1']) {
    const r = await get(`/api/v1/products?${q}`);
    assert.equal(r.status, 422, q); assert.equal(r.json.error.code, 'validation_failed', q);
  }
  const bad = await get('/api/v1/products?cursor=not-a-cursor');
  assert.equal(bad.status, 400); assert.equal(bad.json.error.code, 'bad_cursor');
});

t('product and vendor pages, with clean 404s', async () => {
  const list = await get('/api/v1/products?limit=1');
  const id = list.json.data[0].id;
  const detail = await get(`/api/v1/products/${id}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.json.data.images.length >= 1); assert.ok(detail.json.data.branches.length >= 1);
  assert.equal((await get('/api/v1/products/01ZZZZZZZZZZZZZZZZZZZZZZZZ')).status, 404);
  assert.equal((await get('/api/v1/products/not-an-id')).status, 404);
  const vendor = await get(`/api/v1/vendors/${detail.json.data.vendor.slug}`);
  assert.equal(vendor.status, 200); assert.equal(vendor.json.data.name, detail.json.data.vendor.name);
  assert.equal((await get('/api/v1/vendors/nobody')).status, 404);
  assert.equal((await get('/api/v1/vendors/Bad_Slug!')).status, 404);
  assert.equal((await get('/api/v1/vendors?limit=3')).json.data.length, 3);
});

t('search suggestions need at least two characters', async () => {
  assert.equal((await get('/api/v1/search/suggest?q=m')).status, 422);
  const r = await get('/api/v1/search/suggest?q=ma');
  assert.equal(r.status, 200); assert.ok(r.json.data.length > 0);
});

t('product and vendor links carry share-preview tags', async () => {
  const list = await get('/api/v1/products?limit=1');
  const p = list.json.data[0];
  const page = await get(`/p/${p.id}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.ok(page.text.includes(`<title>${p.name} from ${p.vendor.name} | NaijaBites</title>`.replace(/&/g, '&amp;')));
  assert.match(page.text, /property="og:image" content="https:/);
  assert.match(page.text, /property="og:url" content="http:\/\/localhost:\d+\/p\//);
  assert.match(page.text, /₦[\d,]+ per /);
  assert.equal((page.text.match(/name="description"/g) ?? []).length, 1);
  const vendorPage = await get(`/vendors/${p.vendor.slug}`);
  assert.ok(vendorPage.text.includes(`<title>${p.vendor.name} | NaijaBites</title>`.replace(/&/g, '&amp;')));
});

t('unknown product links, other pages and the API are unaffected by previews', async () => {
  const unknown = await get('/p/01ZZZZZZZZZZZZZZZZZZZZZZZZ');
  assert.equal(unknown.status, 200); assert.ok(unknown.text.includes('<title>NaijaBites</title>')); assert.ok(!unknown.text.includes('og:title'));
  const junk = await get('/p/not-a-ulid');
  assert.ok(junk.text.includes('<title>NaijaBites</title>'));
  assert.ok((await get('/signup')).text.includes('<div id="root">'));
  assert.equal((await get('/api/v1/nope')).status, 404);
  assert.equal((await get('/assets/missing.js')).status, 404);
});

test('preview tags escape dangerous text', () => {
  const html = '<head><meta name="description" content="x" /><title>NaijaBites</title></head>';
  const out = injectMeta(html, { title: 'A "quote" <b>bold</b> & more', description: '<script>alert(1)</script>', url: 'https://x.test/p/1', type: 'product' });
  assert.ok(!out.includes('<script>')); assert.ok(!out.includes('<b>'));
  assert.ok(out.includes('&lt;script&gt;')); assert.ok(out.includes('&quot;quote&quot;'));
  assert.equal((out.match(/<title>/g) ?? []).length, 1);
  assert.ok(out.includes('twitter:card" content="summary"'));
  assert.ok(injectMeta(html, { title: 't', description: 'd', url: 'u', image: 'https://x/i.jpg' }).includes('summary_large_image'));
});
