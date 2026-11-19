import { AppError, conflict, notFound, validationFailed } from '../http/errors.js';
import { ulid } from '../security/ids.js';
import { withTransaction } from '../db/pool.js';

const PRODUCT_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
// Product photos come only from the Unsplash photo service (see searchImages below).
const IMAGE_URL = /^https:\/\/images\.unsplash\.com\/[A-Za-z0-9._~%/-]+(\?[A-Za-z0-9=&%._~:/+,-]*)?$/;
const DOWNLOAD_URL = /^https:\/\/api\.unsplash\.com\/photos\/[A-Za-z0-9_-]+\/download(\?[A-Za-z0-9=&%._-]*)?$/;

function validate(input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationFailed({ body: 'A product object is required.' });
  const errors = {}; const value = {};
  if (!partial || Object.hasOwn(input, 'name')) {
    if (typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.trim().length > 160) errors.name = 'Enter a product name between 2 and 160 characters.';
    else value.name = input.name.trim();
  }
  if (!partial || Object.hasOwn(input, 'priceKobo')) {
    const price = Number(input.priceKobo);
    if (!Number.isSafeInteger(price) || price < 1) errors.priceKobo = 'Enter a valid price in kobo.';
    else value.priceKobo = price;
  }
  if (Object.hasOwn(input, 'description')) {
    if (input.description !== null && (typeof input.description !== 'string' || input.description.length > 1000)) errors.description = 'Description must be 1,000 characters or fewer.';
    else value.description = input.description?.trim() || null;
  } else if (!partial) value.description = null;
  if (Object.hasOwn(input, 'unit')) {
    if (typeof input.unit !== 'string' || !/^[\p{L}\p{N} _-]{1,30}$/u.test(input.unit.trim())) errors.unit = 'Enter a valid unit.';
    else value.unit = input.unit.trim();
  } else if (!partial) value.unit = 'item';
  if (Object.hasOwn(input, 'categoryId')) {
    const id = input.categoryId == null || input.categoryId === '' ? null : Number(input.categoryId);
    if (id !== null && (!Number.isSafeInteger(id) || id < 1)) errors.categoryId = 'Choose a valid category.';
    else value.categoryId = id;
  } else if (!partial) value.categoryId = null;
  if (Object.hasOwn(input, 'isAvailable')) {
    if (typeof input.isAvailable !== 'boolean') errors.isAvailable = 'Availability must be true or false.';
    else value.isAvailable = input.isAvailable;
  }
  if (Object.hasOwn(input, 'maxPerOrder')) {
    const max = Number(input.maxPerOrder);
    if (!Number.isInteger(max) || max < 1 || max > 50) errors.maxPerOrder = 'Maximum per order must be between 1 and 50.';
    else value.maxPerOrder = max;
  } else if (!partial) value.maxPerOrder = 20;
  if (Object.keys(errors).length) throw validationFailed(errors);
  return value;
}

async function getVendor(pool, userId) {
  const [rows] = await pool.execute('SELECT id, status FROM vendors WHERE owner_user_id = ? AND deleted_at IS NULL LIMIT 1', [userId]);
  if (!rows.length) throw notFound('Vendor account not found.');
  if (rows[0].status !== 'approved') throw conflict('Your vendor account must be approved before managing products.');
  return rows[0];
}

const SELECT = `SELECT p.public_id, p.name, p.description, p.price_kobo, p.unit, p.category_id,
 c.name AS category_name, p.is_published, p.is_available, p.max_per_order, p.created_at, p.updated_at,
 (SELECT pi.external_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order, pi.id LIMIT 1) AS image_url,
 (SELECT GROUP_CONCAT(pm.market_code ORDER BY pm.market_code) FROM product_markets pm WHERE pm.product_id = p.id) AS markets
 FROM products p LEFT JOIN categories c ON c.id = p.category_id`;
function map(row) { return { id: row.public_id, name: row.name, description: row.description, priceKobo: Number(row.price_kobo), unit: row.unit, categoryId: row.category_id == null ? null : Number(row.category_id), categoryName: row.category_name ?? null, isPublished: Boolean(row.is_published), isAvailable: Boolean(row.is_available), maxPerOrder: Number(row.max_per_order), imageUrl: row.image_url ?? null, markets: row.markets ? row.markets.split(',') : [], createdAt: row.created_at, updatedAt: row.updated_at }; }

export function createVendorProductService({ pool }) {
  return {
    async list(userId) {
      const vendor = await getVendor(pool, userId);
      const [rows] = await pool.execute(`${SELECT} WHERE p.vendor_id = ? AND p.deleted_at IS NULL ORDER BY p.created_at DESC, p.id DESC`, [vendor.id]);
      return rows.map(map);
    },
    async create(userId, input) {
      const vendor = await getVendor(pool, userId); const v = validate(input);
      if (v.categoryId !== null) { const [cats] = await pool.execute('SELECT id FROM categories WHERE id = ? AND is_active = 1 LIMIT 1', [v.categoryId]); if (!cats.length) throw validationFailed({ categoryId: 'Choose an active category.' }); }
      const id = ulid();
      await pool.execute(`INSERT INTO products (public_id, vendor_id, category_id, name, description, price_kobo, unit, is_published, is_available, max_per_order) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`, [id, vendor.id, v.categoryId, v.name, v.description, v.priceKobo, v.unit, v.maxPerOrder]);
      const [rows] = await pool.execute(`${SELECT} WHERE p.public_id = ? AND p.vendor_id = ? LIMIT 1`, [id, vendor.id]); return map(rows[0]);
    },
    async update(userId, productId, input) {
      if (!PRODUCT_ID.test(productId)) throw notFound('Product not found.');
      const vendor = await getVendor(pool, userId); const v = validate(input, true); const entries = Object.entries(v);
      if (!entries.length) throw validationFailed({ body: 'Provide at least one field to update.' });
      const [existing] = await pool.execute('SELECT id FROM products WHERE public_id = ? AND vendor_id = ? AND deleted_at IS NULL LIMIT 1', [productId, vendor.id]); if (!existing.length) throw notFound('Product not found.');
      if (Object.hasOwn(v, 'categoryId') && v.categoryId !== null) { const [cats] = await pool.execute('SELECT id FROM categories WHERE id = ? AND is_active = 1 LIMIT 1', [v.categoryId]); if (!cats.length) throw validationFailed({ categoryId: 'Choose an active category.' }); }
      const columns = { name: 'name', description: 'description', priceKobo: 'price_kobo', unit: 'unit', categoryId: 'category_id', isAvailable: 'is_available', maxPerOrder: 'max_per_order' };
      await pool.execute(`UPDATE products SET ${entries.map(([k]) => `${columns[k]} = ?`).join(', ')} WHERE public_id = ? AND vendor_id = ? AND deleted_at IS NULL`, [...entries.map(([, val]) => val), productId, vendor.id]);
      const [rows] = await pool.execute(`${SELECT} WHERE p.public_id = ? AND p.vendor_id = ? LIMIT 1`, [productId, vendor.id]); return map(rows[0]);
    },
    async setPublished(userId, productId, published) {
      if (!PRODUCT_ID.test(productId)) throw notFound('Product not found.');
      if (typeof published !== 'boolean') throw validationFailed({ isPublished: 'Choose true or false.' });
      const vendor = await getVendor(pool, userId);
      const [rows] = await pool.execute(`SELECT moderation_status,
        (SELECT COUNT(*) FROM product_images i WHERE i.product_id = products.id) AS images,
        (SELECT COUNT(*) FROM product_markets m WHERE m.product_id = products.id) AS markets
        FROM products WHERE public_id = ? AND vendor_id = ? AND deleted_at IS NULL LIMIT 1`, [productId, vendor.id]);
      if (!rows.length) throw notFound('Product not found.'); if (rows[0].moderation_status !== 'ok') throw conflict('This product has been restricted by the platform.');
      if (published && Number(rows[0].images) === 0) throw conflict('Add a photo before publishing, or customers will not see this product.', 'photo_required');
      if (published && Number(rows[0].markets) === 0) throw conflict('Choose at least one market before publishing, or customers will not see this product.', 'market_required');
      await pool.execute("UPDATE products SET is_published = ? WHERE public_id = ? AND vendor_id = ? AND deleted_at IS NULL AND moderation_status = 'ok'", [published ? 1 : 0, productId, vendor.id]);
      const [updated] = await pool.execute(`${SELECT} WHERE p.public_id = ? AND p.vendor_id = ? LIMIT 1`, [productId, vendor.id]); return map(updated[0]);
    },
    /** Searches the Unsplash photo service. The access key stays on the server and is never sent to the browser. */
    async searchImages(query) {
      const q = String(query ?? '').trim();
      if (q.length < 2 || q.length > 60) throw validationFailed({ q: 'Type 2 to 60 characters to search for photos.' });
      const key = process.env.UNSPLASH_ACCESS_KEY;
      if (!key) throw conflict('Photo search is not set up yet. Ask the platform administrator to add the photo service key.', 'image_search_not_configured');
      let response;
      try {
        response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=12&orientation=landscape&content_filter=high`, {
          headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        throw new AppError(502, 'image_search_unavailable', 'Photo search is not available right now. Please try again in a moment.');
      }
      if (response.status === 403 || response.status === 429) throw conflict('Photo search is busy. Please try again in a few minutes.', 'image_search_busy');
      if (!response.ok) throw new AppError(502, 'image_search_unavailable', 'Photo search is not available right now. Please try again in a moment.');
      const data = await response.json();
      const credit = (url) => (url ? `${url}${url.includes('?') ? '&' : '?'}utm_source=NaijaBites&utm_medium=referral` : null);
      return (Array.isArray(data.results) ? data.results : [])
        .filter((p) => p?.urls && IMAGE_URL.test(String(p.urls.regular ?? '')) && String(p.urls.regular).length <= 500)
        .map((p) => ({
          id: String(p.id),
          thumbUrl: p.urls.small,
          imageUrl: p.urls.regular,
          alt: String(p.alt_description ?? p.description ?? '').slice(0, 200),
          photographer: String(p.user?.name ?? ''),
          photographerUrl: credit(p.user?.links?.html),
          pageUrl: credit(p.links?.html),
          downloadLocation: DOWNLOAD_URL.test(String(p.links?.download_location ?? '')) ? p.links.download_location : null,
        }));
    },
    /** Saves the product's photo (one primary photo) and the markets it is sold in. */
    async setMedia(userId, productId, input) {
      if (!PRODUCT_ID.test(productId)) throw notFound('Product not found.');
      const vendor = await getVendor(pool, userId);
      const errors = {};
      const imageUrl = typeof input?.imageUrl === 'string' ? input.imageUrl.trim() : '';
      if (imageUrl.length > 500 || !IMAGE_URL.test(imageUrl)) errors.imageUrl = 'Choose a photo from the photo search.';
      const altText = typeof input?.altText === 'string' ? input.altText.trim().slice(0, 200) : '';
      const downloadLocation = typeof input?.downloadLocation === 'string' && DOWNLOAD_URL.test(input.downloadLocation) ? input.downloadLocation : null;
      const markets = Array.isArray(input?.markets) ? [...new Set(input.markets.map(String))] : [];
      if (markets.length < 1 || markets.length > 10) errors.markets = 'Choose at least one market.';
      if (Object.keys(errors).length) throw validationFailed(errors);
      const [product] = await pool.execute('SELECT id FROM products WHERE public_id = ? AND vendor_id = ? AND deleted_at IS NULL LIMIT 1', [productId, vendor.id]);
      if (!product.length) throw notFound('Product not found.');
      const [valid] = await pool.query('SELECT code FROM markets WHERE is_active = 1 AND code IN (?)', [markets]);
      if (valid.length !== markets.length) throw validationFailed({ markets: 'Choose from the markets shown.' });
      await withTransaction(pool, async (c) => {
        await c.execute('DELETE FROM product_images WHERE product_id = ?', [product[0].id]);
        await c.execute('INSERT INTO product_images (product_id, external_url, alt_text, sort_order, is_primary) VALUES (?, ?, ?, 0, 1)', [product[0].id, imageUrl, altText || null]);
        await c.execute('DELETE FROM product_markets WHERE product_id = ?', [product[0].id]);
        for (const code of markets) await c.execute('INSERT INTO product_markets (product_id, market_code) VALUES (?, ?)', [product[0].id, code]);
      });
      // Unsplash asks to be told when a photo is used. Best effort: a failure here never blocks the vendor.
      if (downloadLocation && process.env.UNSPLASH_ACCESS_KEY) {
        fetch(downloadLocation, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }, signal: AbortSignal.timeout(5000) }).catch(() => {});
      }
      const [rows] = await pool.execute(`${SELECT} WHERE p.public_id = ? AND p.vendor_id = ? LIMIT 1`, [productId, vendor.id]);
      return map(rows[0]);
    },
    async archive(userId, productId) {
      if (!PRODUCT_ID.test(productId)) throw notFound('Product not found.'); const vendor = await getVendor(pool, userId);
      const [result] = await pool.execute('UPDATE products SET is_published = 0, deleted_at = CURRENT_TIMESTAMP(3) WHERE public_id = ? AND vendor_id = ? AND deleted_at IS NULL', [productId, vendor.id]);
      if (!result.affectedRows) throw notFound('Product not found.'); return { archived: true };
    },
  };
}
