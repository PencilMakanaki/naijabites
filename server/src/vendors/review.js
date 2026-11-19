// Admin review of vendor applications: list, view the uploaded documents, approve or reject.
import { badRequest, conflict, notFound, validationFailed } from '../http/errors.js';
import { withTransaction } from '../db/pool.js';
import { DOC_TYPES } from './onboarding.js';

const ID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const STATUSES = ['pending', 'approved', 'rejected', 'suspended', 'all'];

export function createVendorReviewService({ pool }) {
  async function list(status = 'pending') {
    if (!STATUSES.includes(status)) throw badRequest('Invalid vendor status filter.');
    const where = status === 'all' ? '' : 'AND v.status = ?';
    const [rows] = await pool.execute(
      `SELECT v.id AS internal_id, v.public_id, v.business_name, v.contact_name, v.contact_email, v.contact_phone, v.description,
              v.status, v.rejection_reason, v.created_at, b.address_line, b.area, b.city, b.state
         FROM vendors v
         LEFT JOIN vendor_branches b ON b.id = (SELECT MIN(id) FROM vendor_branches WHERE vendor_id = v.id)
        WHERE v.deleted_at IS NULL ${where}
        ORDER BY v.created_at DESC LIMIT 200`,
      status === 'all' ? [] : [status],
    );
    const docsByVendor = new Map();
    if (rows.length) {
      const [docs] = await pool.query(
        'SELECT vendor_id, doc_type, original_name, size_bytes, created_at FROM vendor_documents WHERE vendor_id IN (?)',
        [rows.map((r) => r.internal_id)],
      );
      for (const d of docs) {
        if (!docsByVendor.has(d.vendor_id)) docsByVendor.set(d.vendor_id, []);
        docsByVendor.get(d.vendor_id).push({ type: d.doc_type, name: d.original_name, sizeBytes: Number(d.size_bytes), uploadedAt: d.created_at });
      }
    }
    return rows.map((r) => ({
      id: r.public_id,
      businessName: r.business_name,
      contactName: r.contact_name,
      contactEmail: r.contact_email,
      contactPhone: r.contact_phone,
      description: r.description,
      status: r.status,
      rejectionReason: r.rejection_reason,
      createdAt: r.created_at,
      address: [r.address_line, r.area, r.city, r.state].filter(Boolean).join(', '),
      documents: docsByVendor.get(r.internal_id) ?? [],
    }));
  }

  async function document(publicId, type) {
    if (!ID.test(publicId) || !DOC_TYPES.includes(type)) throw notFound('Document not found.');
    const [rows] = await pool.execute(
      `SELECT d.mime_type, d.original_name, d.content FROM vendor_documents d JOIN vendors v ON v.id = d.vendor_id
        WHERE v.public_id = ? AND d.doc_type = ? LIMIT 1`,
      [publicId, type],
    );
    if (!rows.length) throw notFound('Document not found.');
    return { mime: rows[0].mime_type, name: rows[0].original_name, content: rows[0].content };
  }

  /** decision: approve | reject | suspend | reactivate */
  async function decide(adminId, publicId, decision, reason = '') {
    if (!ID.test(publicId)) throw badRequest('Invalid vendor reference.');
    if (!['approve', 'reject', 'suspend', 'reactivate'].includes(decision)) throw badRequest('Invalid vendor decision.');
    const note = String(reason ?? '').trim().slice(0, 500);
    if (decision === 'reject' && note.length < 5) throw validationFailed({ reason: 'Give a reason of at least 5 characters, so the applicant knows what to fix.' });

    return withTransaction(pool, async (c) => {
      const [rows] = await c.execute('SELECT id, owner_user_id, status FROM vendors WHERE public_id = ? AND deleted_at IS NULL FOR UPDATE', [publicId]);
      if (!rows.length) throw notFound('Vendor not found.');
      const v = rows[0];
      const allowed = { approve: 'pending', reject: 'pending', suspend: 'approved', reactivate: 'suspended' };
      if (v.status !== allowed[decision]) throw conflict(`This vendor is ${v.status}, so it cannot be given that decision.`);

      if (decision === 'approve') {
        const [[count]] = await c.execute('SELECT COUNT(*) AS n FROM vendor_documents WHERE vendor_id = ?', [v.id]);
        if (Number(count.n) < DOC_TYPES.length) throw conflict('Both documents must be uploaded before this vendor can be approved.');
      }
      if (decision === 'approve' || decision === 'reactivate') {
        await c.execute("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'vendor')", [v.owner_user_id]);
        await c.execute("UPDATE vendors SET status = 'approved', rejection_reason = NULL, approved_by = ?, approved_at = UTC_TIMESTAMP(3) WHERE id = ?", [adminId, v.id]);
        return { id: publicId, status: 'approved', reason: null };
      }
      const next = decision === 'reject' ? 'rejected' : 'suspended';
      await c.execute('UPDATE vendors SET status = ?, rejection_reason = ?, approved_by = NULL, approved_at = NULL WHERE id = ?', [next, note || null, v.id]);
      await c.execute("DELETE FROM user_roles WHERE user_id = ? AND role = 'vendor'", [v.owner_user_id]);
      return { id: publicId, status: next, reason: note || null };
    });
  }

  return { list, document, decide };
}