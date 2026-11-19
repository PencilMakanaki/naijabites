import { withTransaction } from '../db/pool.js';
import { AppError, conflict, notFound } from '../http/errors.js';


const ORDER_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function toSafeInteger(value) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new AppError(
      500,
      'invalid_order_amount',
      'An order contains an invalid amount.',
    );
  }

  return number;
}

function validateOrderId(id) {
  if (typeof id !== 'string' || !ORDER_ID_PATTERN.test(id)) {
    throw notFound('Vendor order not found.');
  }
}

function mapVendorOrder(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    vendorName: row.vendor_name,
    fulfilmentBranchId: row.fulfilment_branch_id == null ? null : Number(row.fulfilment_branch_id),
    fulfilmentBranchName: row.fulfilment_branch_name ?? null,
    subtotalKobo: toSafeInteger(row.subtotal_kobo),
    commissionKobo: toSafeInteger(row.commission_kobo),
    vendorEarningsKobo: toSafeInteger(row.vendor_earnings_kobo),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getVendor(pool, userId) {
  const [rows] = await pool.execute(
    `SELECT id, status
     FROM vendors
     WHERE owner_user_id = ?
       AND deleted_at IS NULL
     LIMIT 1`,
    [userId],
  );

  if (!rows.length) {
    throw notFound('Vendor account not found.');
  }

  if (rows[0].status !== 'approved') {
    throw conflict('Your vendor account is not approved.');
  }

  return rows[0];
}

async function getVendorForUpdate(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT id, status
     FROM vendors
     WHERE owner_user_id = ?
       AND deleted_at IS NULL
     LIMIT 1
     FOR UPDATE`,
    [userId],
  );

  if (!rows.length) {
    throw notFound('Vendor account not found.');
  }

  if (rows[0].status !== 'approved') {
    throw conflict('Your vendor account is not approved.');
  }

  return rows[0];
}

export function createVendorOrderService({ pool }) {
  async function list(userId, { page = 1, pageSize = 10 } = {}) {
    const vendor = await getVendor(pool, userId);

    const offset = (page - 1) * pageSize;

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM vendor_orders
       WHERE vendor_id = ?`,
      [vendor.id],
    );

    const [summaryRows] = await pool.execute(
  `SELECT
      COALESCE(SUM(subtotal_kobo), 0) AS order_value,
      COALESCE(SUM(commission_kobo), 0) AS commission,
      COALESCE(SUM(vendor_earnings_kobo), 0) AS earnings
   FROM vendor_orders
   WHERE vendor_id = ?
     AND status != 'cancelled'`,
  [vendor.id],
);

const summary = {
  orderValueKobo: toSafeInteger(summaryRows[0].order_value),
  commissionKobo: toSafeInteger(summaryRows[0].commission),
  earningsKobo: toSafeInteger(summaryRows[0].earnings),
};

    const [rows] = await pool.execute(
      `SELECT
          vo.public_id AS id,
          o.public_id AS order_id,
          vo.status,
          o.status AS order_status,
          o.payment_status,
          vo.vendor_name,
          vo.fulfilment_branch_id,
          b.name AS fulfilment_branch_name,
          vo.subtotal_kobo,
          vo.commission_kobo,
          vo.vendor_earnings_kobo,
          vo.created_at,
          vo.updated_at
       FROM vendor_orders vo
       INNER JOIN orders o ON o.id = vo.order_id
       LEFT JOIN vendor_branches b ON b.id = vo.fulfilment_branch_id AND b.vendor_id = vo.vendor_id
       WHERE vo.vendor_id = ?
       ORDER BY vo.created_at DESC, vo.id DESC
       LIMIT ? OFFSET ?`,
      [vendor.id, pageSize, offset],
    );

   return {
  orders: rows.map(mapVendorOrder),
  pagination: {
    page,
    pageSize,
    total: Number(countRows[0].total),
    totalPages: Math.ceil(Number(countRows[0].total) / pageSize),
    summary,
  },
};
  }

  async function getById(userId, orderPublicId) {
    validateOrderId(orderPublicId);

    const vendor = await getVendor(pool, userId);

    const [rows] = await pool.execute(
      `SELECT
          vo.id AS internal_id,
          vo.public_id AS id,
          o.public_id AS order_id,
          vo.status,
          o.status AS order_status,
          o.payment_status,
          vo.vendor_name,
          vo.fulfilment_branch_id,
          b.name AS fulfilment_branch_name,
          vo.subtotal_kobo,
          vo.commission_kobo,
          vo.vendor_earnings_kobo,
          vo.created_at,
          vo.updated_at,
          o.recipient_name,
          o.recipient_phone,
          o.address_line1,
          o.address_line2,
          o.area,
          o.city,
          o.state,
          o.landmark,
          o.delivery_instructions
       FROM vendor_orders vo
       INNER JOIN orders o ON o.id = vo.order_id
       LEFT JOIN vendor_branches b ON b.id = vo.fulfilment_branch_id AND b.vendor_id = vo.vendor_id
       WHERE vo.public_id = ?
         AND vo.vendor_id = ?
       LIMIT 1`,
      [orderPublicId, vendor.id],
    );

    if (!rows.length) {
      throw notFound('Vendor order not found.');
    }

    const order = mapVendorOrder(rows[0]);

    order.deliveryAddress = {
      recipientName: rows[0].recipient_name,
      recipientPhone: rows[0].recipient_phone,
      addressLine1: rows[0].address_line1,
      addressLine2: rows[0].address_line2,
      area: rows[0].area,
      city: rows[0].city,
      state: rows[0].state,
      landmark: rows[0].landmark,
      deliveryInstructions: rows[0].delivery_instructions,
    };

    const [items] = await pool.execute(
      `SELECT
          product_public_id AS productId,
          product_name AS productName,
          vendor_name AS vendorName,
          unit,
          quantity,
          unit_price_kobo AS unitPriceKobo,
          line_total_kobo AS lineTotalKobo
       FROM order_items
       WHERE vendor_order_id = ?
       ORDER BY id ASC`,
      [rows[0].internal_id],
    );

    order.items = items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unitPriceKobo: toSafeInteger(item.unitPriceKobo),
      lineTotalKobo: toSafeInteger(item.lineTotalKobo),
    }));

    return order;
  }

  async function changeStatus({
    userId,
    orderPublicId,
    action,
    reason = null,
    auditContext = {},
  }) {
    validateOrderId(orderPublicId);

    if (!['accept', 'reject'].includes(action)) {
      throw new AppError(
        400,
        'invalid_action',
        'Invalid vendor order action.',
      );
    }

    return withTransaction(pool, async (connection) => {
      const vendor = await getVendorForUpdate(connection, userId);

      // Find the parent order before acquiring its lock.
      const [references] = await connection.execute(
        `SELECT id, order_id
         FROM vendor_orders
         WHERE public_id = ?
           AND vendor_id = ?
         LIMIT 1`,
        [orderPublicId, vendor.id],
      );

      if (!references.length) {
        throw notFound('Vendor order not found.');
      }

      // Lock the parent order first to serialize actions across vendors.
      const [orderRows] = await connection.execute(
        `SELECT id, public_id, status, payment_status
         FROM orders
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [references[0].order_id],
      );

      if (!orderRows.length) {
        throw notFound('Order not found.');
      }

      const parentOrder = orderRows[0];

      // Lock this vendor's order.
      const [vendorOrderRows] = await connection.execute(
        `SELECT id, public_id, status
         FROM vendor_orders
         WHERE id = ?
           AND vendor_id = ?
         LIMIT 1
         FOR UPDATE`,
        [references[0].id, vendor.id],
      );

      if (!vendorOrderRows.length) {
        throw notFound('Vendor order not found.');
      }

      const vendorOrder = vendorOrderRows[0];

      if (parentOrder.status !== 'pending_payment') {
        throw conflict(
          'This order can no longer be changed.',
        );
      }

      if (parentOrder.payment_status !== 'unpaid') {
        throw conflict(
          'This order is no longer awaiting payment.',
        );
      }

      if (vendorOrder.status !== 'pending') {
        throw conflict(
          'This vendor order has already been processed.',
        );
      }

      if (action === 'accept') {
        await connection.execute(
          `UPDATE vendor_orders
           SET status = 'accepted'
           WHERE id = ?
             AND status = 'pending'`,
          [vendorOrder.id],
        );

        await connection.execute(
          `INSERT INTO audit_log (
              actor_user_id,
              actor_role,
              action,
              entity_type,
              entity_id,
              after_json,
              ip,
              user_agent
           )
           VALUES (?, 'vendor', 'vendor_order.accepted',
                   'vendor_order', ?, ?, ?, ?)`,
          [
            userId,
            vendorOrder.public_id,
            JSON.stringify({
              status: 'accepted',
              orderId: parentOrder.public_id,
            }),
            auditContext.ip ?? null,
            auditContext.userAgent ?? null,
          ],
        );

        return {
          id: vendorOrder.public_id,
          status: 'accepted',
          orderStatus: parentOrder.status,
        };
      }

      // Rejecting one vendor cancels the entire unpaid checkout.
      await connection.execute(
        `UPDATE vendor_orders
         SET status = 'cancelled'
         WHERE order_id = ?
           AND status IN ('pending', 'accepted')`,
        [parentOrder.id],
      );

      // Release every active reservation belonging to the checkout.
      await connection.execute(
        `UPDATE stock_reservations
         SET status = 'released'
         WHERE order_id = ?
           AND status = 'active'`,
        [parentOrder.id],
      );

      await connection.execute(
        `UPDATE orders
         SET status = 'cancelled'
         WHERE id = ?
           AND status = 'pending_payment'
           AND payment_status = 'unpaid'`,
        [parentOrder.id],
      );

      await connection.execute(
        `INSERT INTO audit_log (
            actor_user_id,
            actor_role,
            action,
            entity_type,
            entity_id,
            after_json,
            ip,
            user_agent
         )
         VALUES (?, 'vendor', 'vendor_order.rejected',
                 'vendor_order', ?, ?, ?, ?)`,
        [
          userId,
          vendorOrder.public_id,
          JSON.stringify({
            status: 'cancelled',
            reason,
            orderId: parentOrder.public_id,
          }),
          auditContext.ip ?? null,
          auditContext.userAgent ?? null,
        ],
      );

      await connection.execute(
        `INSERT INTO audit_log (
            actor_user_id,
            actor_role,
            action,
            entity_type,
            entity_id,
            after_json,
            ip,
            user_agent
         )
         VALUES (?, 'vendor', 'order.cancelled',
                 'order', ?, ?, ?, ?)`,
        [
          userId,
          parentOrder.public_id,
          JSON.stringify({
            status: 'cancelled',
            reason: 'vendor_rejection',
            rejectedVendorOrderId: vendorOrder.public_id,
            rejectedVendorId: vendor.id,
          }),
          auditContext.ip ?? null,
          auditContext.userAgent ?? null,
        ],
      );

      return {
        id: vendorOrder.public_id,
        status: 'cancelled',
        orderId: parentOrder.public_id,
        orderStatus: 'cancelled',
        reason,
      };
    });
  }

  return {
    list,
    getById,
    accept: (input) => changeStatus({
      ...input,
      action: 'accept',
    }),
    reject: (input) => changeStatus({
      ...input,
      action: 'reject',
    }),
  };
}