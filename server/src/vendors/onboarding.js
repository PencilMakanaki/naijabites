// Vendor registration: a signed-in customer applies to sell, uploads two documents, and waits for an admin decision.
// The vendor starts as 'pending', which the storefront already hides.
import { conflict, notFound, validationFailed } from '../http/errors.js';
import { withTransaction } from '../db/pool.js';
import { ulid } from '../security/ids.js';

export const DOC_TYPES = ['business_registration', 'government_id'];
export const MAX_DOC_BYTES = 5 * 1024 * 1024;
const FILE_MESSAGE = 'Choose a PDF, JPG or PNG file up to 5 MB.';

/** Looks at the first bytes of the file, so a renamed file of another kind is refused. */
export function detectDocumentType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

function cleanText(value, min, max) {
  const s = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return s.length >= min && s.length <= max ? s : null;
}

function cleanPhone(value) {
  const s = String(value ?? '').replace(/[\s()-]/g, '');
  if (/^0[789][01]\d{8}$/.test(s)) return `+234${s.slice(1)}`;
  if (/^\+234[789][01]\d{8}$/.test(s)) return s;
  return null;
}

function slugFor(name) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'vendor';
  return `${base}-${ulid().slice(-6).toLowerCase()}`;
}

export function validateApplication(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationFailed({ body: 'Send your business details.' });
  const errors = {};
  const businessName = cleanText(input.businessName, 2, 120);
  if (!businessName) errors.businessName = 'Enter your business name (2 to 120 characters).';
  const contactName = cleanText(input.contactName, 2, 80);
  if (!contactName) errors.contactName = 'Enter the contact person\u2019s name.';
  const contactPhone = cleanPhone(input.contactPhone);
  if (!contactPhone) errors.contactPhone = 'Enter a Nigerian phone number, like 08012345678.';
  let description = null;
  if (input.description != null && String(input.description).trim() !== '') {
    description = cleanText(String(input.description), 1, 1000);
    if (!description) errors.description = 'Keep the description under 1,000 characters.';
  }
  const addressLine = cleanText(input.addressLine, 5, 200);
  if (!addressLine) errors.addressLine = 'Enter the street address of your kitchen or shop.';
  const area = cleanText(input.area, 2, 80);
  if (!area) errors.area = 'Enter the area, like Ikeja.';
  const city = cleanText(input.city, 2, 80);
  if (!city) errors.city = 'Enter the city.';
  const state = cleanText(input.state ?? 'Lagos', 2, 80);
  if (!state) errors.state = 'Enter the state.';
  if (Object.keys(errors).length) throw validationFailed(errors);
  return { businessName, contactName, contactPhone, description, addressLine, area, city, state };
}

export function createVendorOnboardingService({ pool }) {
  async function mine(userId) {
    const [rows] = await pool.execute(
      'SELECT id, public_id, business_name, status, rejection_reason, created_at FROM vendors WHERE owner_user_id = ? AND deleted_at IS NULL LIMIT 1',
      [userId],
    );
    if (!rows.length) return null;
    const [docs] = await pool.execute('SELECT doc_type, original_name, size_bytes, created_at FROM vendor_documents WHERE vendor_id = ?', [rows[0].id]);
    const have = docs.map((d) => d.doc_type);
    return {
      id: rows[0].public_id,
      businessName: rows[0].business_name,
      status: rows[0].status,
      rejectionReason: rows[0].rejection_reason ?? null,
      createdAt: rows[0].created_at,
      documents: docs.map((d) => ({ type: d.doc_type, name: d.original_name, sizeBytes: Number(d.size_bytes), uploadedAt: d.created_at })),
      missingDocuments: DOC_TYPES.filter((t) => !have.includes(t)),
    };
  }

  async function apply(userId, input) {
    const v = validateApplication(input);
    await withTransaction(pool, async (c) => {
      const [users] = await c.execute('SELECT email FROM users WHERE id = ? LIMIT 1', [userId]);
      if (!users.length) throw notFound('Account not found.');
      const [existing] = await c.execute('SELECT id, status, deleted_at FROM vendors WHERE owner_user_id = ? FOR UPDATE', [userId]);
      if (existing.length) {
        const row = existing[0];
        if (row.deleted_at || row.status !== 'rejected') throw conflict('You already have a vendor application or account.');
        // A rejected applicant may apply again: details are replaced and new documents are required.
        await c.execute(
          `UPDATE vendors SET business_name = ?, contact_name = ?, contact_phone = ?, description = ?, status = 'pending',
             rejection_reason = NULL, approved_by = NULL, approved_at = NULL WHERE id = ?`,
          [v.businessName, v.contactName, v.contactPhone, v.description, row.id],
        );
        await c.execute('DELETE FROM vendor_documents WHERE vendor_id = ?', [row.id]);
        await c.execute('UPDATE vendor_branches SET address_line = ?, area = ?, city = ?, state = ?, phone = ? WHERE vendor_id = ? ORDER BY id LIMIT 1',
          [v.addressLine, v.area, v.city, v.state, v.contactPhone, row.id]);
        return;
      }
      const [vendor] = await c.execute(
        `INSERT INTO vendors (public_id, owner_user_id, business_name, slug, contact_name, contact_email, contact_phone, description, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [ulid(), userId, v.businessName, slugFor(v.businessName), v.contactName, users[0].email, v.contactPhone, v.description],
      );
      await c.execute(
        "INSERT INTO vendor_branches (vendor_id, name, address_line, area, city, state, phone) VALUES (?, 'Main branch', ?, ?, ?, ?, ?)",
        [vendor.insertId, v.addressLine, v.area, v.city, v.state, v.contactPhone],
      );
    });
    return mine(userId);
  }

  async function saveDocument(userId, type, { buffer, originalName }) {
    if (!DOC_TYPES.includes(type)) throw notFound('Unknown document type.');
    if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > MAX_DOC_BYTES) throw validationFailed({ file: FILE_MESSAGE });
    const mime = detectDocumentType(buffer);
    if (!mime) throw validationFailed({ file: FILE_MESSAGE });
    const [rows] = await pool.execute('SELECT id, status FROM vendors WHERE owner_user_id = ? AND deleted_at IS NULL LIMIT 1', [userId]);
    if (!rows.length) throw notFound('Start your vendor application first.');
    if (rows[0].status !== 'pending') throw conflict('Documents can only be changed while your application is pending.');
    const name = String(originalName || 'document').replace(/[\\/\r\n\0]/g, '_').slice(0, 200) || 'document';
    await pool.execute(
      `INSERT INTO vendor_documents (vendor_id, doc_type, original_name, mime_type, size_bytes, content) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE original_name = VALUES(original_name), mime_type = VALUES(mime_type), size_bytes = VALUES(size_bytes),
         content = VALUES(content), created_at = CURRENT_TIMESTAMP(3)`,
      [rows[0].id, type, name, mime, buffer.length, buffer],
    );
    return mine(userId);
  }

  return { mine, apply, saveDocument };
}
