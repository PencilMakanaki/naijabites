// Read-only catalogue queries for the public storefront.
// Only products that are published, available, not hidden, with an approved vendor and at least one
// image are ever shown. Lists use keyset paging (continue after the last item), never OFFSET.
import { AppError } from '../http/errors.js';

const VISIBLE = `p.is_published = 1 AND p.is_available = 1 AND p.moderation_status = 'ok' AND p.deleted_at IS NULL
  AND v.status = 'approved' AND v.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM product_images pix WHERE pix.product_id = p.id)`;

const FIRST_IMAGE = (column) => `(SELECT pi.${column} FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order, pi.id LIMIT 1)`;

const PRODUCT_COLUMNS = `p.id, p.public_id, p.name, p.description, p.price_kobo, p.unit, p.badge, p.fulfilment_mode,
  v.id AS vendor_id, v.public_id AS vendor_public_id, v.business_name AS vendor_name, v.slug AS vendor_slug,
  ${FIRST_IMAGE('external_url')} AS image_external_url,
  ${FIRST_IMAGE('storage_key')} AS image_storage_key,
  ${FIRST_IMAGE('alt_text')} AS image_alt,
  (SELECT GROUP_CONCAT(pm.market_code) FROM product_markets pm WHERE pm.product_id = p.id) AS markets`;

export const escapeLike = (term) => String(term).replace(/[\\%_]/g, '\\$&');
// MySQL reads the escape character from a quoted backslash; SQLite (used in tests) needs a different spelling.
const likeSql = (dialect) => (dialect === 'sqlite' ? "LIKE ? ESCAPE '\\'" : "LIKE ? ESCAPE '\\\\'");

export function encodeCursor(row, sort) {
  const body = sort === 'newest' ? { i: Number(row.id) } : { i: Number(row.id), p: Number(row.price_kobo) };
  return Buffer.from(JSON.stringify(body)).toString('base64url');
}

export function decodeCursor(cursor, sort) {
  try {
    const body = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    const ok = Number.isSafeInteger(body.i) && body.i > 0 && (sort === 'newest' || (Number.isSafeInteger(body.p) && body.p >= 0));
    if (!ok) throw new Error('shape');
    return body;
  } catch {
    throw new AppError(400, 'bad_cursor', 'That page marker is not valid. Reload the list.');
  }
}

/** Builds the SQL and parameters for the product list. limit is already a checked integer. */
export function buildProductsQuery(filters, { dialect = 'mysql' } = {}) {
  const { market, category, vendor, q, sort = 'newest', limit = 20, cursor } = filters;
  const where = [VISIBLE];
  const params = [];
  if (market) { where.push('EXISTS (SELECT 1 FROM product_markets pm WHERE pm.product_id = p.id AND pm.market_code = ?)'); params.push(market); }
  if (category) { where.push('p.category_id = (SELECT c.id FROM categories c WHERE c.slug = ?)'); params.push(category); }
  if (vendor) { where.push('v.slug = ?'); params.push(vendor); }
  if (q) {
    const like = likeSql(dialect);
    where.push(`(p.name ${like} OR v.business_name ${like} OR p.description ${like})`);
    const pattern = `%${escapeLike(q)}%`;
    params.push(pattern, pattern, pattern);
  }
  if (cursor) {
    const c = decodeCursor(cursor, sort);
    if (sort === 'newest') { where.push('p.id < ?'); params.push(c.i); }
    else if (sort === 'price_asc') { where.push('(p.price_kobo > ? OR (p.price_kobo = ? AND p.id > ?))'); params.push(c.p, c.p, c.i); }
    else { where.push('(p.price_kobo < ? OR (p.price_kobo = ? AND p.id < ?))'); params.push(c.p, c.p, c.i); }
  }
  const order = sort === 'price_asc' ? 'p.price_kobo ASC, p.id ASC' : sort === 'price_desc' ? 'p.price_kobo DESC, p.id DESC' : 'p.id DESC';
  const take = Number(limit) + 1; // one extra row tells us whether there is another page
  const sql = `SELECT ${PRODUCT_COLUMNS} FROM products p JOIN vendors v ON v.id = p.vendor_id WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${take}`;
  return { sql, params };
}

const imageUrl = (external, storageKey, mediaBaseUrl) => external || (storageKey ? `${mediaBaseUrl}/${storageKey}` : null);

export function mapProduct(row, mediaBaseUrl = '/media') {
  const url = imageUrl(row.image_external_url, row.image_storage_key, mediaBaseUrl);
  return {
    id: row.public_id,
    name: row.name,
    description: row.description ?? '',
    priceKobo: Number(row.price_kobo),
    unit: row.unit,
    badge: row.badge ?? null,
    fulfilmentMode: row.fulfilment_mode,
    vendor: { id: row.vendor_public_id, name: row.vendor_name, slug: row.vendor_slug },
    image: url ? { url, alt: row.image_alt || row.name } : null,
    markets: row.markets ? row.markets.split(',') : [],
  };
}

export function createCatalogue({ pool, dialect = 'mysql', mediaBaseUrl = '/media' }) {
  const like = likeSql(dialect);

  async function listMarkets() {
    const [rows] = await pool.execute('SELECT code, name, short_label, heading, blurb, icon, is_main FROM markets WHERE is_active = 1 ORDER BY sort_order, code');
    return rows.map((r) => ({ code: r.code, name: r.name, shortLabel: r.short_label, heading: r.heading, blurb: r.blurb ?? null, icon: r.icon, isMain: Boolean(r.is_main) }));
  }

  async function listCategories() {
    const [rows] = await pool.execute('SELECT slug, name FROM categories WHERE is_active = 1 ORDER BY sort_order, name');
    return rows.map((r) => ({ slug: r.slug, name: r.name }));
  }

  async function listProducts(filters) {
    const { sql, params } = buildProductsQuery(filters, { dialect });
    const [rows] = await pool.execute(sql, params);
    const limit = Number(filters.limit ?? 20);
    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? encodeCursor(page[page.length - 1], filters.sort ?? 'newest') : null;
    return { items: page.map((r) => mapProduct(r, mediaBaseUrl)), nextCursor };
  }

  async function getProduct(publicId) {
    const [rows] = await pool.execute(
      `SELECT ${PRODUCT_COLUMNS}, v.description AS vendor_description FROM products p JOIN vendors v ON v.id = p.vendor_id
        WHERE ${VISIBLE} AND p.public_id = ? LIMIT 1`,
      [publicId],
    );
    const row = rows[0];
    if (!row) return null;
    const [images] = await pool.execute(
      'SELECT external_url, storage_key, alt_text FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order, id',
      [row.id],
    );
    const [branches] = await pool.execute(
      'SELECT name, area, city, state FROM vendor_branches WHERE vendor_id = ? AND is_active = 1 ORDER BY id',
      [row.vendor_id],
    );
    const product = mapProduct(row, mediaBaseUrl);
    return {
      ...product,
      vendor: { ...product.vendor, description: row.vendor_description ?? '' },
      images: images.map((i) => ({ url: imageUrl(i.external_url, i.storage_key, mediaBaseUrl), alt: i.alt_text || row.name })).filter((i) => i.url),
      branches: branches.map((b) => ({ name: b.name, area: b.area, city: b.city, state: b.state })),
    };
  }

  const VENDOR_COUNT = `(SELECT COUNT(*) FROM products p WHERE p.vendor_id = v.id AND p.is_published = 1 AND p.is_available = 1
     AND p.moderation_status = 'ok' AND p.deleted_at IS NULL AND EXISTS (SELECT 1 FROM product_images pix WHERE pix.product_id = p.id))`;

  async function getVendor(slug) {
    const [rows] = await pool.execute(
      `SELECT v.id, v.public_id, v.business_name, v.slug, v.description, ${VENDOR_COUNT} AS product_count
         FROM vendors v WHERE v.slug = ? AND v.status = 'approved' AND v.deleted_at IS NULL LIMIT 1`,
      [slug],
    );
    const row = rows[0];
    if (!row) return null;
    const [branches] = await pool.execute('SELECT name, area, city, state FROM vendor_branches WHERE vendor_id = ? AND is_active = 1 ORDER BY id', [row.id]);
    return {
      id: row.public_id, name: row.business_name, slug: row.slug, description: row.description ?? '',
      productCount: Number(row.product_count),
      branches: branches.map((b) => ({ name: b.name, area: b.area, city: b.city, state: b.state })),
    };
  }

  async function listVendors({ q, limit = 50 } = {}) {
    const params = [];
    let search = '';
    if (q) { search = `AND v.business_name ${like}`; params.push(`%${escapeLike(q)}%`); }
    const [rows] = await pool.execute(
      `SELECT v.public_id, v.business_name, v.slug, v.description, ${VENDOR_COUNT} AS product_count,
              (SELECT GROUP_CONCAT(b.area) FROM vendor_branches b WHERE b.vendor_id = v.id AND b.is_active = 1) AS areas
         FROM vendors v WHERE v.status = 'approved' AND v.deleted_at IS NULL ${search}
        ORDER BY v.business_name LIMIT ${Number(limit)}`,
      params,
    );
    return rows.map((r) => ({
      id: r.public_id, name: r.business_name, slug: r.slug, description: r.description ?? '', productCount: Number(r.product_count),
      areas: r.areas ? [...new Set(r.areas.split(','))] : [],
    }));
  }

  async function suggest(q) {
    const pattern = `${escapeLike(q)}%`;
    const [products] = await pool.execute(
      `SELECT DISTINCT p.name FROM products p JOIN vendors v ON v.id = p.vendor_id WHERE ${VISIBLE} AND p.name ${like} ORDER BY p.name LIMIT 5`,
      [pattern],
    );
    const [vendors] = await pool.execute(
      `SELECT v.business_name AS name, v.slug FROM vendors v WHERE v.status = 'approved' AND v.deleted_at IS NULL AND v.business_name ${like} ORDER BY v.business_name LIMIT 3`,
      [pattern],
    );
    return [
      ...vendors.map((v) => ({ type: 'vendor', text: v.name, slug: v.slug })),
      ...products.map((p) => ({ type: 'product', text: p.name })),
    ];
  }

  return { listMarkets, listCategories, listProducts, getProduct, getVendor, listVendors, suggest };
}
