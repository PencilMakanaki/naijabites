import { ulid } from '../security/ids.js';
import { SEED_CATEGORIES, SEED_PRODUCTS, SEED_VENDORS } from './seedData.js';

// Marks the sample owner accounts as impossible to sign in to (no password matches this text).
const NO_LOGIN = '!sample-account-no-login';

/**
 * Fills the catalogue with sample vendors and products. Safe to run again: anything that already
 * exists is left alone. Works with any database object that has execute(sql, params).
 */
export async function seedCatalogue(db) {
  const counts = { categories: 0, vendors: 0, products: 0, skipped: 0 };
  const first = async (sql, params) => (await db.execute(sql, params))[0][0];

  const categoryIds = new Map();
  for (const [index, c] of SEED_CATEGORIES.entries()) {
    let row = await first('SELECT id FROM categories WHERE slug = ?', [c.slug]);
    if (!row) {
      const [result] = await db.execute('INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)', [c.slug, c.name, index + 1]);
      row = { id: result.insertId }; counts.categories += 1;
    }
    categoryIds.set(c.slug, row.id);
  }

  const vendorIds = new Map();
  for (const v of SEED_VENDORS) {
    let row = await first('SELECT id FROM vendors WHERE slug = ?', [v.slug]);
    if (!row) {
      const email = `sample.${v.slug}@example.test`;
      const [user] = await db.execute(
        'INSERT INTO users (public_id, full_name, email, email_verified_at, password_hash, status) VALUES (?, ?, ?, ?, ?, ?)',
        [ulid(), `${v.name} (sample owner)`.slice(0, 80), email, new Date(), NO_LOGIN, 'active'],
      );
      await db.execute('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [user.insertId, 'vendor']);
      const [vendor] = await db.execute(
        `INSERT INTO vendors (public_id, owner_user_id, business_name, slug, contact_name, contact_email, description, status, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?)`,
        [ulid(), user.insertId, v.name, v.slug, v.name, email, `${v.name} is a sample vendor used while NaijaBites is being built.`, new Date()],
      );
      await db.execute(
        'INSERT INTO vendor_branches (vendor_id, name, address_line, area, city, state) VALUES (?, ?, ?, ?, ?, ?)',
        [vendor.insertId, 'Main branch', 'Sample address', v.area, 'Lagos', 'Lagos'],
      );
      row = { id: vendor.insertId }; counts.vendors += 1;
    }
    vendorIds.set(v.name, row.id);
  }

  for (const p of SEED_PRODUCTS) {
    const vendorId = vendorIds.get(p.vendor);
    if (await first('SELECT id FROM products WHERE vendor_id = ? AND name = ?', [vendorId, p.name])) { counts.skipped += 1; continue; }
    const [product] = await db.execute(
      `INSERT INTO products (public_id, vendor_id, category_id, name, description, price_kobo, unit, fulfilment_mode, is_published, is_available, badge)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      [ulid(), vendorId, p.category ? categoryIds.get(p.category) : null, p.name, p.description, Math.round(p.priceNaira * 100), p.unit, p.fulfilmentMode, p.badge],
    );
    await db.execute('INSERT INTO product_images (product_id, external_url, alt_text, sort_order, is_primary) VALUES (?, ?, ?, 0, 1)', [product.insertId, p.image, p.name]);
    for (const market of p.markets) await db.execute('INSERT INTO product_markets (product_id, market_code) VALUES (?, ?)', [product.insertId, market]);
    counts.products += 1;
  }
  return counts;
}
