import { notFound } from '../http/errors.js';

const MAX_SAFE_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);

function toSafeInteger(value, label) {
  let result;

  try {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'boolean'
    ) {
      throw new Error('Invalid amount');
    }

    result = BigInt(String(value));
  } catch {
    throw new Error(`${label} contains an invalid amount.`);
  }

  if (result < 0n || result > MAX_SAFE_AMOUNT) {
    throw new Error(`${label} exceeds the supported amount limit.`);
  }

  return Number(result);
}

const ORDER_FIELDS = `
  public_id AS id,
  status,
  payment_status AS paymentStatus,
  recipient_name AS recipientName,
  recipient_phone AS recipientPhone,
  address_line1 AS addressLine1,
  address_line2 AS addressLine2,
  area,
  city,
  state,
  landmark,
  delivery_instructions AS deliveryInstructions,
  delivery_zone_name AS deliveryZoneName,
  subtotal_kobo AS subtotalKobo,
  delivery_fee_kobo AS deliveryFeeKobo,
  total_kobo AS totalKobo,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

function mapOrder(row) {
  return {
    id: row.id,
    status: row.status,
    paymentStatus: row.paymentStatus,
    deliveryAddress: {
      recipientName: row.recipientName,
      recipientPhone: row.recipientPhone,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      area: row.area,
      city: row.city,
      state: row.state,
      landmark: row.landmark,
      deliveryInstructions: row.deliveryInstructions,
      deliveryZoneName: row.deliveryZoneName,
    },
    subtotalKobo: toSafeInteger(row.subtotalKobo, 'Order subtotal'),
    deliveryFeeKobo: toSafeInteger(
      row.deliveryFeeKobo,
      'Delivery fee',
    ),
    totalKobo: toSafeInteger(row.totalKobo, 'Order total'),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createOrderQueries({ pool }) {
  return {
    async list(userId, { page = 1, pageSize = 10 } = {}) {
      const [countRows] = await pool.execute(
        `SELECT COUNT(*) AS total
         FROM orders
         WHERE user_id = ?`,
        [userId],
      );

      const total = Number(countRows[0].total);
      const offset = (page - 1) * pageSize;

      const [rows] = await pool.execute(
        `SELECT ${ORDER_FIELDS}
         FROM orders
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [userId, pageSize, offset],
      );

      return {
        orders: rows.map(mapOrder),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    },

    async getById(userId, orderPublicId) {
      const [orderRows] = await pool.execute(
        `SELECT ${ORDER_FIELDS}
         FROM orders
         WHERE user_id = ?
           AND public_id = ?
         LIMIT 1`,
        [userId, orderPublicId],
      );

      if (!orderRows[0]) {
        throw notFound('Order not found.');
      }

      const order = mapOrder(orderRows[0]);

      const [vendorRows] = await pool.execute(
        `SELECT
            vo.id AS internalId,
            vo.public_id AS id,
            vo.vendor_name AS vendorName,
            vo.status,
            vo.subtotal_kobo AS subtotalKobo,
            vo.commission_bps AS commissionBps,
            vo.commission_kobo AS commissionKobo,
            vo.vendor_earnings_kobo AS vendorEarningsKobo,
            vo.created_at AS createdAt,
            vo.updated_at AS updatedAt
         FROM vendor_orders vo
         INNER JOIN orders o ON o.id = vo.order_id
         WHERE o.user_id = ?
           AND o.public_id = ?
         ORDER BY vo.id ASC`,
        [userId, orderPublicId],
      );

      const vendorOrders = vendorRows.map((vendor) => ({
        id: vendor.id,
        vendorName: vendor.vendorName,
        status: vendor.status,
        subtotalKobo: toSafeInteger(
          vendor.subtotalKobo,
          'Vendor subtotal',
        ),
        commissionBps: Number(vendor.commissionBps),
        commissionKobo: toSafeInteger(
          vendor.commissionKobo,
          'Vendor commission',
        ),
        vendorEarningsKobo: toSafeInteger(
          vendor.vendorEarningsKobo,
          'Vendor earnings',
        ),
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
        items: [],
      }));

      if (vendorRows.length) {
        const vendorOrderIds = vendorRows.map(
          (vendor) => vendor.internalId,
        );

        const placeholders = vendorOrderIds.map(() => '?').join(', ');

        const [itemRows] = await pool.execute(
          `SELECT
              vendor_order_id AS vendorOrderId,
              product_public_id AS productId,
              product_name AS productName,
              vendor_name AS vendorName,
              unit,
              quantity,
              unit_price_kobo AS unitPriceKobo,
              line_total_kobo AS lineTotalKobo
           FROM order_items
           WHERE vendor_order_id IN (${placeholders})
           ORDER BY id ASC`,
          vendorOrderIds,
        );

        const vendorMap = new Map(
          vendorRows.map((vendor, index) => [
            String(vendor.internalId),
            vendorOrders[index],
          ]),
        );

        for (const item of itemRows) {
          const vendor = vendorMap.get(String(item.vendorOrderId));

          if (!vendor) continue;

          vendor.items.push({
            productId: item.productId,
            productName: item.productName,
            vendorName: item.vendorName,
            unit: item.unit,
            quantity: Number(item.quantity),
            unitPriceKobo: toSafeInteger(
              item.unitPriceKobo,
              'Product price',
            ),
            lineTotalKobo: toSafeInteger(
              item.lineTotalKobo,
              'Product line total',
            ),
          });
        }
      }

      return {
        ...order,
        vendorOrders,
      };
    },
  };
}