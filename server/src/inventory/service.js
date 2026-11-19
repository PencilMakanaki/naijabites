import { withTransaction } from '../db/pool.js';
import { ulid } from '../security/ids.js';
import { badRequest, conflict, notFound } from '../http/errors.js';
import { validateInventoryMovement } from './validation.js';
export function createBranchInventoryService({ pool }) {
  async function getVendorId(userId) {
    const [rows] = await pool.execute("SELECT id FROM vendors WHERE owner_user_id = ? AND status = 'approved' LIMIT 1", [userId]);
    if (!rows[0]) throw notFound('Approved vendor account not found.');
    return rows[0].id;
  }
  async function list(userId, { branchId, page = 1, pageSize = 50 } = {}) {
    const vendorId = await getVendorId(userId);
    const size = Math.min(Math.max(Number(pageSize) || 50, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
    const params = [vendorId];
    let branchClause = '';
    if (branchId != null) { branchClause = ' AND i.branch_id = ?'; params.push(Number(branchId)); }
    const [rows] = await pool.execute(`SELECT i.branch_id AS branchId, b.name AS branchName,
      i.product_id AS productInternalId, p.public_id AS productId, p.name AS productName,
      i.stock_on_hand AS stockOnHand, i.updated_at AS updatedAt
      FROM branch_product_inventory i JOIN vendor_branches b ON b.id=i.branch_id
      JOIN products p ON p.id=i.product_id WHERE i.vendor_id=? ${branchClause}
      ORDER BY b.name,p.name LIMIT ? OFFSET ?`, [...params, size, offset]);
    return rows.map(r => ({ ...r, branchId: Number(r.branchId), stockOnHand: Number(r.stockOnHand) }));
  }
  async function adjust(userId, { branchId, productId, quantityDelta, movementType, note }) {
    const vendorId = await getVendorId(userId);
    return withTransaction(pool, async conn => {
      const [rows] = await conn.execute(`SELECT i.stock_on_hand FROM branch_product_inventory i
        JOIN products p ON p.id=i.product_id AND p.public_id=?
        WHERE i.vendor_id=? AND i.branch_id=? AND i.product_id=p.id FOR UPDATE`, [productId, vendorId, branchId]);
      if (!rows[0]) throw notFound('Branch inventory item not found.');
      const { before, after } = validateInventoryMovement({
        quantityBefore: rows[0].stock_on_hand,
        quantityDelta,
        movementType,
      });
      const [reservationRows] = await conn.execute(
        `SELECT quantity
         FROM stock_reservations
         WHERE vendor_id = ? AND branch_id = ?
           AND product_id = (SELECT id FROM products WHERE public_id = ? AND vendor_id = ?)
           AND status = 'active'
           AND (
             expires_at > UTC_TIMESTAMP(3)
             OR EXISTS (
               SELECT 1 FROM payment_transactions pt
               WHERE pt.order_id = stock_reservations.order_id
                 AND pt.status IN ('initializing', 'initialized')
             )
           )
         FOR UPDATE`,
        [vendorId, branchId, productId, vendorId],
      );
      const reservedQuantity = reservationRows.reduce((sum, row) => sum + Number(row.quantity), 0);
      if (after < reservedQuantity) {
        throw conflict('Stock cannot be reduced below the quantity reserved for unpaid orders.', 'stock_below_active_reservations');
      }
      await conn.execute('UPDATE branch_product_inventory SET stock_on_hand=? WHERE vendor_id=? AND branch_id=? AND product_id=(SELECT id FROM products WHERE public_id=? AND vendor_id=?)', [after, vendorId, branchId, productId, vendorId]);
      const movementId = ulid();
      await conn.execute(`INSERT INTO inventory_movements
        (public_id,vendor_id,branch_id,product_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,note,actor_user_id)
        SELECT ?,?,?,p.id,?,?,?,?, 'manual',?,? FROM products p WHERE p.public_id=? AND p.vendor_id=?`,
        [movementId,vendorId,branchId,movementType,quantityDelta,before,after,note?.trim() || null,userId,productId,vendorId]);
      await conn.execute(`INSERT INTO audit_log(actor_user_id,actor_role,action,entity_type,entity_id,after_json)
        VALUES(?,'vendor','inventory.adjusted','inventory_movement',?,?)`,
        [userId,movementId,JSON.stringify({branchId,productId,movementType,quantityDelta,before,after})]);
      return { id: movementId, branchId: Number(branchId), productId, movementType, quantityDelta, quantityBefore: before, quantityAfter: after };
    });
  }
  async function movements(userId, { branchId, productId, limit = 50 } = {}) {
    const vendorId = await getVendorId(userId);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const clauses = ['m.vendor_id=?']; const params = [vendorId];
    if (branchId != null) { clauses.push('m.branch_id=?'); params.push(Number(branchId)); }
    if (productId) { clauses.push('p.public_id=?'); params.push(productId); }
    const [rows] = await pool.execute(`SELECT m.public_id AS id,m.branch_id AS branchId,p.public_id AS productId,p.name AS productName,
      m.movement_type AS movementType,m.quantity_delta AS quantityDelta,m.quantity_before AS quantityBefore,
      m.quantity_after AS quantityAfter,m.note,m.created_at AS createdAt FROM inventory_movements m
      JOIN products p ON p.id=m.product_id WHERE ${clauses.join(' AND ')} ORDER BY m.id DESC LIMIT ${safeLimit}`, params);
    return rows.map(r => Object.fromEntries(Object.entries(r).map(([k,v]) => [k, ['branchId','quantityDelta','quantityBefore','quantityAfter'].includes(k) ? Number(v) : v])));
  }
  return { list, adjust, movements };
}
