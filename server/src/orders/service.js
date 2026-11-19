import { withTransaction } from '../db/pool.js';
import { ulid } from '../security/ids.js';
import { getOrderSettings } from '../settings/service.js';
import { selectFulfilmentBranch } from '../inventory/branchSelection.js';
import {
  AppError,
  badRequest,
  conflict,
  notFound,
} from '../http/errors.js';

const MAX_SAFE_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);

function configurationError(message) {
  return new AppError(503, 'configuration_error', message);
}

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
    throw new AppError(
      500,
      'invalid_amount',
      `${label} contains an invalid amount.`,
    );
  }

  if (result < 0n || result > MAX_SAFE_AMOUNT) {
    throw new AppError(
      422,
      'amount_limit_exceeded',
      `${label} exceeds the supported amount limit.`,
    );
  }

  return Number(result);
}

function calculateCommission(subtotalKobo, commissionBps) {
  const subtotal = BigInt(subtotalKobo);
  const rate = BigInt(commissionBps);

  // Integer arithmetic with half-up rounding.
  return (subtotal * rate + 5000n) / 10000n;
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('Invalid order request.');
  }

  const { addressId, idempotencyKey } = input;
  const validId = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

  if (typeof addressId !== 'string' || !validId.test(addressId)) {
    throw badRequest('Select a valid delivery address.');
  }

  if (
    typeof idempotencyKey !== 'string' ||
    idempotencyKey.length < 16 ||
    idempotencyKey.length > 80 ||
    !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw badRequest('A valid order request key is required.');
  }
}

async function findExistingOrder(pool, userId, idempotencyKey) {
  const [rows] = await pool.execute(
    `SELECT
        public_id AS id,
        status,
        payment_status AS paymentStatus,
        subtotal_kobo AS subtotalKobo,
        delivery_fee_kobo AS deliveryFeeKobo,
        total_kobo AS totalKobo,
        created_at AS createdAt
     FROM orders
     WHERE user_id = ?
       AND idempotency_key = ?
     LIMIT 1`,
    [userId, idempotencyKey],
  );

  if (!rows[0]) return null;

  return mapOrder(rows[0], true);
}

function mapOrder(row, alreadyExists = false) {
  return {
    id: row.id,
    status: row.status,
    paymentStatus: row.paymentStatus,
    subtotalKobo: toSafeInteger(row.subtotalKobo, 'Order subtotal'),
    deliveryFeeKobo: toSafeInteger(
      row.deliveryFeeKobo,
      'Delivery fee',
    ),
    totalKobo: toSafeInteger(row.totalKobo, 'Order total'),
    createdAt: row.createdAt,
    alreadyExists,
  };
}

async function lockCustomerCart(connection, userId) {
  const [carts] = await connection.execute(
    `SELECT id
     FROM carts
     WHERE user_id = ?
     FOR UPDATE`,
    [userId],
  );

  if (!carts[0]) {
    throw conflict('Your cart is empty.');
  }

  return carts[0].id;
}

async function getCartItems(connection, cartId) {
  const [items] = await connection.execute(
    `SELECT
        id,
        product_id AS productId,
        quantity
     FROM cart_items
     WHERE cart_id = ?
     ORDER BY product_id ASC
     FOR UPDATE`,
    [cartId],
  );

  if (!items.length) {
    throw conflict('Your cart is empty.');
  }

  return items;
}

async function getLockedProducts(connection, cartItems) {
  const productIds = cartItems.map((item) => item.productId);
  const placeholders = productIds.map(() => '?').join(', ');

  const [rows] = await connection.execute(
    `SELECT
        p.id,
        p.public_id AS publicId,
        p.vendor_id AS vendorId,
        p.name,
        p.price_kobo AS priceKobo,
        p.unit,
        p.weight_grams AS weightGrams,
        p.track_stock AS trackStock,
        p.stock_on_hand AS stockOnHand,
        p.max_per_order AS maxPerOrder,
        p.is_published AS isPublished,
        p.is_available AS isAvailable,
        p.moderation_status AS moderationStatus,
        p.fulfilment_mode AS fulfilmentMode,
        p.deleted_at AS deletedAt,
        v.business_name AS vendorName,
        v.status AS vendorStatus,
        v.deleted_at AS vendorDeletedAt,
        v.commission_bps AS commissionBps
     FROM products p
     JOIN vendors v ON v.id = p.vendor_id
     WHERE p.id IN (${placeholders})
     ORDER BY p.id ASC
     FOR UPDATE`,
    productIds,
  );

  if (rows.length !== cartItems.length) {
    throw conflict(
      'One or more products in your cart are no longer available.',
    );
  }

  const products = new Map();

  for (const product of rows) {
    products.set(String(product.id), product);
  }

  return products;
}

async function validateCartProducts(connection, cartItems, products) {
  const validatedItems = [];

  for (const cartItem of cartItems) {
    const product = products.get(String(cartItem.productId));

    if (!product) {
      throw conflict('A product in your cart is no longer available.');
    }

    const quantity = Number(cartItem.quantity);
    const maxPerOrder = Number(product.maxPerOrder);

    if (
      !Number.isSafeInteger(quantity) ||
      !Number.isSafeInteger(maxPerOrder) ||
      quantity < 1 ||
      maxPerOrder < 1 ||
      quantity > maxPerOrder
    ) {
      throw conflict(
        `The quantity requested for ${product.name} is no longer valid.`,
      );
    }

    if (
      !product.isPublished ||
      !product.isAvailable ||
      product.moderationStatus !== 'ok' ||
      product.fulfilmentMode !== 'standard' ||
      product.deletedAt ||
      product.vendorStatus !== 'approved' ||
      product.vendorDeletedAt
    ) {
      throw conflict(
        `${product.name} is no longer available. Remove it from your cart.`,
      );
    }

    const unitPriceKobo = toSafeInteger(
      product.priceKobo,
      'Product price',
    );

    const lineTotal = BigInt(unitPriceKobo) * BigInt(quantity);

    validatedItems.push({
      product,
      quantity,
      unitPriceKobo,
      lineTotalKobo: toSafeInteger(
        lineTotal,
        'Product line total',
      ),
    });
  }

  return validatedItems;
}

async function getLockedAddress(connection, userId, addressId) {
  const [rows] = await connection.execute(
    `SELECT
        id,
        recipient_name AS recipientName,
        phone,
        address_line1 AS addressLine1,
        address_line2 AS addressLine2,
        area,
        city,
        state,
        landmark,
        latitude,
        longitude,
        delivery_instructions AS deliveryInstructions
     FROM customer_addresses
     WHERE user_id = ?
       AND public_id = ?
     FOR UPDATE`,
    [userId, addressId],
  );

  if (!rows[0]) {
    throw notFound('Delivery address not found.');
  }

  return rows[0];
}

function groupItemsByVendor(items) {
  const groups = new Map();

  for (const item of items) {
    const vendorId = String(item.product.vendorId);

    if (!groups.has(vendorId)) {
      groups.set(vendorId, {
        vendorId: item.product.vendorId,
        vendorName: item.product.vendorName,
        commissionBps: item.product.commissionBps,
        items: [],
        subtotal: 0n,
      });
    }

    const group = groups.get(vendorId);

    group.items.push(item);
    group.subtotal += BigInt(item.lineTotalKobo);
  }

  return [...groups.values()];
}

export async function assignFulfilmentBranches(connection, vendorGroups, address) {
  for (const group of vendorGroups) {
    const trackedItems = group.items.filter((item) => Boolean(Number(item.product.trackStock)));
    const productIds = trackedItems.map((item) => Number(item.product.id));

    let inventoryRows = [];
    if (productIds.length) {
      const placeholders = productIds.map(() => '?').join(', ');
      await connection.execute(
        `UPDATE stock_reservations sr
         SET status = 'expired', updated_at = UTC_TIMESTAMP(3)
         WHERE sr.vendor_id = ?
           AND sr.product_id IN (${placeholders})
           AND sr.branch_id IS NOT NULL
           AND sr.status = 'active'
           AND sr.expires_at <= UTC_TIMESTAMP(3)
           AND NOT EXISTS (
             SELECT 1 FROM payment_transactions pt
             WHERE pt.order_id = sr.order_id
               AND pt.status IN ('initializing', 'initialized')
           )`,
        [group.vendorId, ...productIds],
      );

      const [rows] = await connection.execute(
        `SELECT b.id AS branchId, b.latitude, b.longitude,
                b.is_active AS isActive, i.product_id AS productId,
                i.stock_on_hand AS stockOnHand
         FROM vendor_branches b
         LEFT JOIN branch_product_inventory i
           ON i.vendor_id = b.vendor_id
          AND i.branch_id = b.id
          AND i.product_id IN (${placeholders})
         WHERE b.vendor_id = ? AND b.is_active = 1
         ORDER BY b.id ASC, i.product_id ASC
         FOR UPDATE`,
        [...productIds, group.vendorId],
      );
      inventoryRows = rows;
    } else {
      const [rows] = await connection.execute(
        `SELECT id AS branchId, latitude, longitude,
                is_active AS isActive
         FROM vendor_branches
         WHERE vendor_id = ? AND is_active = 1
         ORDER BY id ASC
         FOR UPDATE`,
        [group.vendorId],
      );
      inventoryRows = rows;
    }

    const branchesById = new Map();
    for (const row of inventoryRows) {
      const id = Number(row.branchId);
      if (!branchesById.has(id)) {
        branchesById.set(id, {
          id,
          latitude: row.latitude,
          longitude: row.longitude,
          isActive: row.isActive,
          inventory: new Map(),
        });
      }
      if (row.productId != null) {
        branchesById.get(id).inventory.set(String(row.productId), Number(row.stockOnHand ?? 0));
      }
    }

    const branches = [...branchesById.values()];
    if (!branches.length) {
      if (productIds.length) {
        const placeholders = productIds.map(() => '?').join(', ');
        const [existingBranchStock] = await connection.execute(
          `SELECT id FROM branch_product_inventory
           WHERE vendor_id = ? AND product_id IN (${placeholders})
           LIMIT 1 FOR UPDATE`,
          [group.vendorId, ...productIds],
        );
        if (existingBranchStock.length) {
          throw conflict(`No active branch is available to fulfil ${group.vendorName}'s order.`);
        }
        await connection.execute(
          `UPDATE stock_reservations sr
           SET status = 'expired', updated_at = UTC_TIMESTAMP(3)
           WHERE sr.vendor_id = ? AND sr.product_id IN (${placeholders})
             AND sr.branch_id IS NULL AND sr.status = 'active'
             AND sr.expires_at <= UTC_TIMESTAMP(3)
             AND NOT EXISTS (
               SELECT 1 FROM payment_transactions pt
               WHERE pt.order_id = sr.order_id
                 AND pt.status IN ('initializing', 'initialized')
             )`,
          [group.vendorId, ...productIds],
        );
        for (const item of trackedItems) {
          const [reservationRows] = await connection.execute(
            `SELECT sr.quantity FROM stock_reservations sr
             WHERE sr.vendor_id = ? AND sr.product_id = ? AND sr.branch_id IS NULL
               AND sr.status = 'active'
               AND (
                 sr.expires_at > UTC_TIMESTAMP(3)
                 OR EXISTS (
                   SELECT 1 FROM payment_transactions pt
                   WHERE pt.order_id = sr.order_id
                     AND pt.status IN ('initializing', 'initialized')
                 )
               )
             FOR UPDATE`,
            [group.vendorId, item.product.id],
          );
          const reserved = reservationRows.reduce((sum, row) => sum + Number(row.quantity), 0);
          if (Number(item.product.stockOnHand ?? 0) - reserved < item.quantity) {
            throw conflict(`There is not enough stock available for ${item.product.name}.`);
          }
        }
      }
      // Preserve the legacy product-level inventory path for vendors that
      // have not created any branches yet. New branch-enabled vendors never
      // fall back to global stock when a branch is merely out of stock.
      group.branchId = null;
      continue;
    }

    if (productIds.length) {
      const placeholders = productIds.map(() => '?').join(', ');
      await connection.execute(
        `UPDATE stock_reservations sr
         SET status = 'expired', updated_at = UTC_TIMESTAMP(3)
         WHERE sr.vendor_id = ?
           AND sr.product_id IN (${placeholders})
           AND sr.branch_id IS NULL
           AND sr.status = 'active'
           AND sr.expires_at <= UTC_TIMESTAMP(3)
           AND NOT EXISTS (
             SELECT 1 FROM payment_transactions pt
             WHERE pt.order_id = sr.order_id
               AND pt.status IN ('initializing', 'initialized')
           )`,
        [group.vendorId, ...productIds],
      );
      const [legacyReservationRows] = await connection.execute(
        `SELECT sr.id
         FROM stock_reservations sr
         WHERE sr.vendor_id = ?
           AND sr.product_id IN (${placeholders})
           AND sr.branch_id IS NULL
           AND sr.status = 'active'
           AND (
             sr.expires_at > UTC_TIMESTAMP(3)
             OR EXISTS (
               SELECT 1 FROM payment_transactions pt
               WHERE pt.order_id = sr.order_id
                 AND pt.status IN ('initializing', 'initialized')
             )
           )
         LIMIT 1 FOR UPDATE`,
        [group.vendorId, ...productIds],
      );
      if (legacyReservationRows.length) {
        throw conflict(`An older order still holds product-level stock for ${group.vendorName}. Resolve that order before branch stock can be used.`);
      }
      const [configuredInventoryRows] = await connection.execute(
        `SELECT branch_id AS branchId, product_id AS productId
         FROM branch_product_inventory
         WHERE vendor_id = ? AND product_id IN (${placeholders})
         ORDER BY branch_id ASC FOR UPDATE`,
        [group.vendorId, ...productIds],
      );
      const configuredProductIds = new Set(configuredInventoryRows.map((row) => Number(row.productId)));
      const primaryBranch = branches[0];
      for (const item of trackedItems) {
        const productId = Number(item.product.id);
        if (configuredProductIds.has(productId)) continue;
        const initialStock = Number(item.product.stockOnHand ?? 0);
        if (!Number.isSafeInteger(initialStock) || initialStock < 0 || initialStock > 4_294_967_295) {
          throw conflict(`Legacy stock for ${item.product.name} is invalid and must be corrected before checkout.`);
        }
        await connection.execute(
          `INSERT INTO branch_product_inventory (vendor_id, branch_id, product_id, stock_on_hand)
           VALUES (?, ?, ?, ?)`,
          [group.vendorId, primaryBranch.id, productId, initialStock],
        );
        primaryBranch.inventory.set(String(productId), initialStock);
        if (initialStock > 0) {
          await connection.execute(
            `INSERT INTO inventory_movements (
                public_id, vendor_id, branch_id, product_id, movement_type,
                quantity_delta, quantity_before, quantity_after,
                reference_type, reference_id, actor_user_id
             ) VALUES (?, ?, ?, ?, 'opening', ?, 0, ?, 'legacy_stock_import', NULL, NULL)`,
            [ulid(), group.vendorId, primaryBranch.id, productId, initialStock, initialStock],
          );
        }
      }
    }

    if (productIds.length && branches.length) {
      const [reservationRows] = await connection.execute(
        `SELECT branch_id AS branchId, product_id AS productId, quantity
         FROM stock_reservations
         WHERE vendor_id = ?
           AND branch_id IN (${branches.map(() => '?').join(', ')})
           AND product_id IN (${productIds.map(() => '?').join(', ')})
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
        [group.vendorId, ...branches.map((branch) => branch.id), ...productIds],
      );
      const reserved = new Map();
      for (const row of reservationRows) {
        const key = `${Number(row.branchId)}:${Number(row.productId)}`;
        reserved.set(key, (reserved.get(key) ?? 0) + Number(row.quantity));
      }
      for (const branch of branches) {
        for (const productId of productIds) {
          const key = `${branch.id}:${productId}`;
          const physical = branch.inventory.get(String(productId)) ?? 0;
          branch.inventory.set(String(productId), Math.max(0, physical - (reserved.get(key) ?? 0)));
        }
      }
    }

    const branch = selectFulfilmentBranch({
      branches,
      items: trackedItems.map((item) => ({ productId: Number(item.product.id), quantity: item.quantity })),
      customerCoordinates: { latitude: address.latitude, longitude: address.longitude },
    });

    if (!branch) {
      throw conflict(`No active branch has enough stock to fulfil all items from ${group.vendorName}.`);
    }
    group.branchId = Number(branch.id);
  }
}

async function createOrderRecords(
  connection,
  {
    userId,
    cartId,
    idempotencyKey,
    address,
    items,
    settings,
    auditContext,
  },
) {
  const vendorGroups = groupItemsByVendor(items);
  await assignFulfilmentBranches(connection, vendorGroups, address);

  let subtotal = 0n;

  for (const item of items) {
    subtotal += BigInt(item.lineTotalKobo);
  }

  const deliveryFee = BigInt(String(settings.deliveryFeeFlatKobo));

  const subtotalKobo = toSafeInteger(subtotal, 'Order subtotal');

  const deliveryFeeKobo = toSafeInteger(
    deliveryFee,
    'Delivery fee',
  );

  const totalKobo = toSafeInteger(
    subtotal + deliveryFee,
    'Order total',
  );

  const orderPublicId = ulid();

  const [orderResult] = await connection.execute(
    `INSERT INTO orders (
        public_id,
        user_id,
        idempotency_key,
        status,
        payment_status,
        recipient_name,
        recipient_phone,
        address_line1,
        address_line2,
        area,
        city,
        state,
        landmark,
        delivery_instructions,
        delivery_latitude,
        delivery_longitude,
        delivery_zone_id,
        delivery_zone_name,
        subtotal_kobo,
        delivery_fee_kobo,
        total_kobo
     )
     VALUES (
        ?, ?, ?, 'pending_payment', 'unpaid',
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     )`,
    [
      orderPublicId,
      userId,
      idempotencyKey,
      address.recipientName,
      address.phone,
      address.addressLine1,
      address.addressLine2,
      address.area,
      address.city,
      address.state,
      address.landmark,
      address.deliveryInstructions,
      address.latitude ?? null,
      address.longitude ?? null,
      null,
      'Temporary flat-rate delivery',
      subtotalKobo,
      deliveryFeeKobo,
      totalKobo,
    ],
  );

  const orderId = orderResult.insertId;

  for (const group of vendorGroups) {
    const commissionBps =
      group.commissionBps === null
        ? settings.commissionDefaultBps
        : Number(group.commissionBps);

    if (
      commissionBps === null ||
      !Number.isInteger(commissionBps) ||
      commissionBps < 0 ||
      commissionBps > 10000
    ) {
      throw configurationError(
        `Commission is not configured correctly for ${group.vendorName}.`,
      );
    }

    const commission = calculateCommission(
      group.subtotal,
      commissionBps,
    );

    const earnings = group.subtotal - commission;

    const vendorSubtotal = toSafeInteger(
      group.subtotal,
      'Vendor subtotal',
    );

    const commissionKobo = toSafeInteger(
      commission,
      'Vendor commission',
    );

    const earningsKobo = toSafeInteger(
      earnings,
      'Vendor earnings',
    );

    const [vendorOrderResult] = await connection.execute(
      `INSERT INTO vendor_orders (
          public_id,
          order_id,
          vendor_id,
          fulfilment_branch_id,
          vendor_name,
          status,
          subtotal_kobo,
          commission_bps,
          commission_kobo,
          vendor_earnings_kobo
       )
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        ulid(),
        orderId,
        group.vendorId,
        group.branchId,
        group.vendorName,
        vendorSubtotal,
        commissionBps,
        commissionKobo,
        earningsKobo,
      ],
    );

    const vendorOrderId = vendorOrderResult.insertId;

    for (const item of group.items) {
      const [itemResult] = await connection.execute(
        `INSERT INTO order_items (
            vendor_order_id,
            product_id,
            product_public_id,
            product_name,
            vendor_name,
            unit,
            quantity,
            unit_price_kobo,
            unit_weight_grams,
            line_total_kobo
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vendorOrderId,
          item.product.id,
          item.product.publicId,
          item.product.name,
          group.vendorName,
          item.product.unit,
          item.quantity,
          item.unitPriceKobo,
          item.product.weightGrams ?? null,
          item.lineTotalKobo,
        ],
      );

      if (item.product.trackStock) {
        await connection.execute(
          `INSERT INTO stock_reservations (
              order_id,
              order_item_id,
              product_id,
              vendor_id,
              branch_id,
              quantity,
              status,
              expires_at
           )
           VALUES (
              ?, ?, ?, ?, ?, ?, 'active',
              TIMESTAMPADD(MINUTE, ?, UTC_TIMESTAMP(3))
           )`,
          [
            orderId,
            itemResult.insertId,
            item.product.id,
            item.product.vendorId,
            group.branchId,
            item.quantity,
            settings.stockHoldMinutes,
          ],
        );
      }
    }
  }

  // Clear only the cart that was locked for this checkout.
  await connection.execute(
    `DELETE FROM cart_items
     WHERE cart_id = ?`,
    [cartId],
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
     VALUES (?, 'customer', 'order.created', 'order', ?, ?, ?, ?)`,
    [
      userId,
      orderPublicId,
      JSON.stringify({
        status: 'pending_payment',
        paymentStatus: 'unpaid',
        subtotalKobo,
        deliveryFeeKobo,
        totalKobo,
        vendorCount: vendorGroups.length,
      }),
      auditContext?.ip ?? null,
      auditContext?.userAgent ?? null,
    ],
  );

  return {
    id: orderPublicId,
    status: 'pending_payment',
    paymentStatus: 'unpaid',
    subtotalKobo,
    deliveryFeeKobo,
    totalKobo,
    vendorCount: vendorGroups.length,
    stockHoldMinutes: settings.stockHoldMinutes,
    createdAt: new Date().toISOString(),
    alreadyExists: false,
  };
}

export function createOrderService({ pool }) {
  return {
    async create(userId, input, auditContext = {}) {
      validateInput(input);

      const { addressId, idempotencyKey } = input;

      const existing = await findExistingOrder(
        pool,
        userId,
        idempotencyKey,
      );

      if (existing) {
        return existing;
      }

      try {
        return await withTransaction(pool, async (connection) => {
          // Lock the cart to serialize simultaneous checkout requests.
          const cartId = await lockCustomerCart(connection, userId);

          // Check again inside the transaction for idempotency.
          const [existingRows] = await connection.execute(
            `SELECT
                public_id AS id,
                status,
                payment_status AS paymentStatus,
                subtotal_kobo AS subtotalKobo,
                delivery_fee_kobo AS deliveryFeeKobo,
                total_kobo AS totalKobo,
                created_at AS createdAt
             FROM orders
             WHERE user_id = ?
               AND idempotency_key = ?
             LIMIT 1`,
            [userId, idempotencyKey],
          );

          if (existingRows[0]) {
            return mapOrder(existingRows[0], true);
          }

          const cartItems = await getCartItems(
            connection,
            cartId,
          );

          const products = await getLockedProducts(
            connection,
            cartItems,
          );

          const items = await validateCartProducts(
            connection,
            cartItems,
            products,
          );

          const address = await getLockedAddress(
            connection,
            userId,
            addressId,
          );

          const settings = await getOrderSettings(connection);

          return createOrderRecords(connection, {
            userId,
            cartId,
            idempotencyKey,
            address,
            items,
            settings,
            auditContext,
          });
        });
      } catch (error) {
        // A simultaneous request may have inserted the same key.
        // Return that order instead of creating a duplicate.
        if (
          error?.code === 'ER_DUP_ENTRY' ||
          error?.errno === 1062
        ) {
          const duplicate = await findExistingOrder(
            pool,
            userId,
            idempotencyKey,
          );

          if (duplicate) return duplicate;
        }

        throw error;
      }
    },
  };
}