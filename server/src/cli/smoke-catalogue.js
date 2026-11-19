// Checks the storefront data on the running server and your real MySQL: markets, product lists,
// paging, sorting, filters, search, product and vendor pages. Run `npm run seed:dev` first so there is
// something to check, start the server (npm run dev), then run:  npm run smoke:catalogue
const BASE = (process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');

async function get(path) {
  const response = await fetch(`${BASE}/api/v1${path}`);
  let json = null;
  try { json = await response.json(); } catch { /* no body */ }
  return { status: response.status, json, data: json?.data, meta: json?.meta, error: json?.error };
}

let failures = 0;
function check(label, passed, detail = '') {
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${!passed && detail ? `  (${detail})` : ''}`);
}

async function allPages(query) {
  const items = []; let cursor; let pages = 0;
  do {
    const r = await get(`/products?${query}&limit=5${cursor ? `&cursor=${cursor}` : ''}`);
    if (r.status !== 200) throw new Error(`products?${query} gave status ${r.status} ${r.error?.message ?? ''}`);
    items.push(...r.data); cursor = r.meta?.nextCursor; pages += 1;
  } while (cursor && pages < 60);
  return items;
}

async function main() {
  console.log(`Testing ${BASE}\n`);
  let r = await get('/markets');
  check('Markets list has the 6 markets', r.status === 200 && r.data?.length === 6 && r.data[0].code === 'breakfast', `status ${r.status}`);
  check('Market names keep their accents (Cafés & Bakeries)', r.data?.[0]?.name === 'Cafés & Bakeries', r.data?.[0]?.name);
  const markets = r.data ?? [];

  r = await get('/products?limit=50');
  check('Products are listed', r.status === 200 && r.data?.length > 0, r.data?.length === 0 ? 'no products: run npm run seed:dev first' : `status ${r.status} ${r.error?.message ?? ''}`);
  if (!r.data?.length) { console.log('\nStopping: there is nothing to check yet.'); process.exit(1); }
  const total = r.data.length;

  const paged = await allPages('sort=newest');
  check('Paging visits every product once', paged.length === total && new Set(paged.map((p) => p.id)).size === total, `${paged.length} of ${total}`);
  const asc = (await allPages('sort=price_asc')).map((p) => p.priceKobo);
  const desc = (await allPages('sort=price_desc')).map((p) => p.priceKobo);
  check('Price low to high is in order across pages', asc.length === total && asc.every((v, i) => i === 0 || asc[i - 1] <= v));
  check('Price high to low is in order across pages', desc.length === total && desc.every((v, i) => i === 0 || desc[i - 1] >= v));

  for (const m of markets) {
    const items = await allPages(`market=${m.code}`);
    check(`Market "${m.name}" lists only its own items`, items.length > 0 && items.every((p) => p.markets.includes(m.code)), `${items.length} items`);
  }

  r = await get('/products?q=jollof&limit=50');
  check('Search finds jollof (any capital letters)', r.status === 200 && r.data.length > 0 && (await get('/products?q=JOLLOF&limit=50')).data.length === r.data.length);
  // % and _ are wildcards in SQL; here they must be treated as plain characters, so they match nothing.
  for (const wild of ['%25', '_']) {
    const s = await get(`/products?q=${wild}&limit=5`);
    check(`Search for "${decodeURIComponent(wild)}" is plain text, not a wildcard`, s.status === 200 && s.data.length === 0, `status ${s.status} ${s.data?.length} results`);
  }
  // Quotes and SQL are just text: the server must answer normally (an apostrophe may match real descriptions).
  for (const text of ["'", '%22%3B%20DROP%20TABLE%20products%3B%20--', '%5C']) {
    const s = await get(`/products?q=${text}&limit=5`);
    check(`Search for ${decodeURIComponent(text)} is handled safely`, s.status === 200 && Array.isArray(s.data), `status ${s.status} ${s.error?.message ?? ''}`);
  }
  check('The products table is still there after those searches', (await get('/products?limit=1')).data?.length === 1);

  const first = r.data[0];
  const detail = await get(`/products/${first.id}`);
  check('Product page has pictures, branches and the vendor', detail.status === 200 && detail.data.images.length > 0 && detail.data.branches.length > 0 && Boolean(detail.data.vendor.slug), `status ${detail.status}`);
  check('An unknown product is a clean 404', (await get('/products/01ZZZZZZZZZZZZZZZZZZZZZZZZ')).status === 404);

  const vendor = await get(`/vendors/${first.vendor.slug}`);
  check('Vendor page works and counts its menu', vendor.status === 200 && vendor.data.productCount > 0, `status ${vendor.status}`);
  check('Vendor list works', (await get('/vendors?limit=5')).data?.length > 0);
  const suggest = await get('/search/suggest?q=ma');
  check('Search suggestions work', suggest.status === 200 && Array.isArray(suggest.data));

  check('A damaged page marker is refused', (await get('/products?cursor=oops')).status === 400);
  check('A bad limit is refused', (await get('/products?limit=0')).status === 422);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed. Copy this whole output and send it to me.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nCould not finish: ${err.message}`);
  console.error('Is the server running (npm run dev), and did you run npm run db:migrate and npm run seed:dev?');
  process.exit(1);
});
