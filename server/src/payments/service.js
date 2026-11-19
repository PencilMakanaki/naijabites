import { randomBytes } from 'node:crypto';
import { withTransaction } from '../db/pool.js';
import {
  AppError,
  badRequest,
  conflict,
  notFound,
} from '../http/errors.js';

const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function ulid() {
  let value =
    (BigInt(Date.now()) << 80n) |
    BigInt(`0x${randomBytes(10).toString('hex')}`);

  let result = '';

  for (let i = 0; i < 26; i++) {
    result = ULID_ALPHABET[Number(value & 31n)] + result;
    value >>= 5n;
  }

  return result;
}

const PAYMENT_REFERENCE_PREFIX = 'NB_';

function createPaymentReference() {
  return `${PAYMENT_REFERENCE_PREFIX}${ulid()}`;
}

function gatewayStatusOf(result) {
  return String(
    result?.data?.status ??
    result?.status ??
    'pending',
  ).toLowerCase();
}

function gatewayDataOf(result) {
  return result?.data ?? result;
}

export function createPaymentService({
  pool,
  paystack,
  clientOrigin,
}) {
  if (!pool) throw new Error('Database pool is required.');
  if (!paystack) throw new Error('Paystack client is required.');
  if (!clientOrigin) throw new Error('Client origin is required.');

  async function preparePayment(userId, orderPublicId) {
    return withTransaction(pool, async (connection) => {
      const [orders] = await connection.execute(
        `SELECT
            o.id AS orderId,
            o.public_id AS orderPublicId,
            o.user_id AS userId,
            o.status AS orderStatus,
            o.payment_status AS paymentStatus,
            o.total_kobo AS totalKobo,
            u.email AS customerEmail
         FROM orders o
         JOIN users u ON u.id = o.user_id
         WHERE o.public_id = ?
           AND o.user_id = ?
         LIMIT 1
         FOR UPDATE`,
        [orderPublicId, userId],
      );

      const order = orders[0];

      if (!order) {
        throw notFound('Order not found.');
      }

      if (
        order.orderStatus !== 'pending_payment' ||
        order.paymentStatus === 'paid'
      ) {
        throw conflict('This order is not awaiting payment.');
      }

      const [reservationRows] = await connection.execute(
        `SELECT
            COUNT(*) AS totalReservations,
            SUM(
              CASE
                WHEN status = 'active'
                 AND expires_at > UTC_TIMESTAMP(3)
                THEN 1
                ELSE 0
              END
            ) AS activeReservations
         FROM stock_reservations
         WHERE order_id = ?`,
        [order.orderId],
      );

      const totalReservations = Number(
        reservationRows[0]?.totalReservations ?? 0,
      );

      const activeReservations = Number(
        reservationRows[0]?.activeReservations ?? 0,
      );

      if (
        totalReservations > 0 &&
        activeReservations !== totalReservations
      ) {
        throw conflict(
          'Your stock reservation has expired. Please review your order.',
        );
      }

      const [existingRows] = await connection.execute(
        `SELECT
            id,
            public_id AS paymentPublicId,
            reference,
            authorization_url AS authorizationUrl,
            status
         FROM payment_transactions
         WHERE order_id = ?
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [order.orderId],
      );

      const existingPayment = existingRows[0];

      if (
        existingPayment?.status === 'initialized' &&
        existingPayment.authorizationUrl
      ) {
        return {
          paymentId: existingPayment.paymentPublicId,
          reference: existingPayment.reference,
          authorizationUrl: existingPayment.authorizationUrl,
          reused: true,
        };
      }

      if (existingPayment?.status === 'initializing') {
        throw conflict(
          'Payment initialization is already in progress.',
        );
      }

      const reference = createPaymentReference();

      const [insertResult] = await connection.execute(
        `INSERT INTO payment_transactions (
            public_id,
            order_id,
            provider,
            reference,
            amount_kobo,
            currency,
            status
         )
         VALUES (?, ?, 'paystack', ?, ?, 'NGN', 'initializing')`,
        [
          ulid(),
          order.orderId,
          reference,
          Number(order.totalKobo),
        ],
      );

      return {
        paymentId: insertResult.insertId,
        orderId: order.orderId,
        orderPublicId: order.orderPublicId,
        email: order.customerEmail,
        amountKobo: Number(order.totalKobo),
        reference,
        reused: false,
      };
    });
  }

  async function markPaymentFailed(reference, reason) {
    await pool.execute(
      `UPDATE payment_transactions
       SET status = 'failed',
           failure_reason = ?,
           updated_at = UTC_TIMESTAMP(3)
       WHERE reference = ?
         AND status = 'initializing'`,
      [String(reason).slice(0, 500), reference],
    );
  }

  async function initialize(userId, orderPublicId) {
    const prepared = await preparePayment(userId, orderPublicId);

    if (prepared.reused) {
      return {
        authorizationUrl: prepared.authorizationUrl,
        reference: prepared.reference,
        paymentId: prepared.paymentId,
      };
    }

    try {
      const callbackUrl = new URL(
        '/payment/callback',
        clientOrigin,
      );

      callbackUrl.searchParams.set('orderId', prepared.orderPublicId);

      const response = await paystack.initialize({
        email: prepared.email,
        amountKobo: prepared.amountKobo,
        reference: prepared.reference,
        callbackUrl: callbackUrl.toString(),
        metadata: {
          order_id: prepared.orderPublicId,
        },
      });

      const data = gatewayDataOf(response);

      if (
        response?.status === false ||
        !data?.authorization_url
      ) {
        throw new Error(
          data?.message || 'Paystack initialization failed.',
        );
      }

      await pool.execute(
        `UPDATE payment_transactions
         SET status = 'initialized',
             authorization_url = ?,
             gateway_response = ?,
             updated_at = UTC_TIMESTAMP(3)
         WHERE reference = ?
           AND status = 'initializing'`,
        [
          data.authorization_url,
          JSON.stringify(response),
          prepared.reference,
        ],
      );

      return {
        authorizationUrl: data.authorization_url,
        reference: prepared.reference,
        paymentId: prepared.paymentId,
      };
    } catch (error) {
      await markPaymentFailed(
        prepared.reference,
        error.message || 'Payment initialization failed.',
      );

      throw error;
    }
  }

  async function loadPayment(reference) {
    return withTransaction(pool, async (connection) => {
      const [rows] = await connection.execute(
        `SELECT
            pt.id AS paymentId,
            pt.reference,
            pt.amount_kobo AS amountKobo,
            pt.currency,
            pt.status AS paymentStatus,
            pt.provider_transaction_id AS providerTransactionId,
            o.id AS orderId,
            o.public_id AS orderPublicId,
            o.status AS orderStatus,
            o.payment_status AS orderPaymentStatus,
            o.total_kobo AS orderTotal
         FROM payment_transactions pt
         JOIN orders o ON o.id = pt.order_id
         WHERE pt.reference = ?
         LIMIT 1`,
        [reference],
      );

      return rows[0] ?? null;
    });
  }

  async function recordUnsuccessfulPayment(
    payment,
    gatewayStatus,
    gatewayResponse,
  ) {
    const paymentStatus =
      gatewayStatus === 'abandoned'
        ? 'abandoned'
        : 'failed';

    await withTransaction(pool, async (connection) => {
      const [rows] = await connection.execute(
        `SELECT
            pt.id AS paymentId,
            pt.status AS paymentStatus
         FROM payment_transactions pt
         WHERE pt.id = ?
         LIMIT 1
         FOR UPDATE`,
        [payment.paymentId],
      );

      if (!rows[0]) {
        throw notFound('Payment transaction not found.');
      }

      if (rows[0].paymentStatus === 'success') {
        return;
      }

      await connection.execute(
        `UPDATE payment_transactions
         SET status = ?,
             failure_reason = ?,
             gateway_response = ?,
             verified_at = UTC_TIMESTAMP(3),
             updated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [
          paymentStatus,
          gatewayStatus,
          JSON.stringify(gatewayResponse),
          payment.paymentId,
        ],
      );

      await connection.execute(
        `INSERT INTO audit_log (
            actor_user_id,
            actor_role,
            action,
            entity_type,
            entity_id,
            after_json
         )
         VALUES (
            NULL,
            'system',
            ?,
            'payment',
            ?,
            ?
         )`,
        [
          'payment.failed',
          String(payment.paymentId),
          JSON.stringify({
            reference: payment.reference,
            status: paymentStatus,
            gatewayStatus,
          }),
        ],
      );
    });

    return {
      verified: true,
      paymentStatus,
      retryAllowed: true,
      reference: payment.reference,
    };
  }

  async function settleSuccessfulPayment(
    payment,
    gatewayResponse,
  ) {
    return withTransaction(pool, async (connection) => {
      // Lock the order before the payment row. Checkout initialization also
      // locks in this order, which avoids a payment/order lock-order inversion.
      const [orderRows] = await connection.execute(
        `SELECT
            id,
            status AS orderStatus,
            payment_status AS orderPaymentStatus
         FROM orders
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [payment.orderId],
      );
      const currentOrder = orderRows[0];

      if (!currentOrder) {
        throw notFound('Order not found.');
      }

      const [paymentRows] = await connection.execute(
        `SELECT
            pt.id AS paymentId,
            pt.status AS paymentStatus
         FROM payment_transactions pt
         WHERE pt.id = ?
         LIMIT 1
         FOR UPDATE`,
        [payment.paymentId],
      );

      const currentPayment = paymentRows[0];

      if (!currentPayment) {
        throw notFound('Payment transaction not found.');
      }

      if (currentPayment.paymentStatus === 'success') {
        return {
          verified: true,
          alreadySettled: true,
          paymentStatus: 'success',
          orderStatus: payment.orderStatus,
          inventoryAvailable: true,
          reference: payment.reference,
        };
      }

      if (
        currentPayment.paymentStatus !== 'initialized' &&
        currentPayment.paymentStatus !== 'initializing'
      ) {
        throw conflict(
          'This payment cannot be settled in its current state.',
        );
      }

      // A vendor may reject an unpaid checkout while the customer still has
      // an open Paystack authorization page. If Paystack captures that payment
      // afterwards, record the money as received but never resurrect the
      // cancelled order or consume stock. It must go to manual payment review.
      const orderCanBeFulfilled =
        currentOrder.orderStatus === 'pending_payment' &&
        currentOrder.orderPaymentStatus === 'unpaid';

      const [items] = orderCanBeFulfilled
        ? await connection.execute(
            `SELECT
                oi.id AS orderItemId,
                oi.product_id AS productId,
                vo.fulfilment_branch_id AS branchId,
                oi.quantity
             FROM order_items oi
             JOIN vendor_orders vo
               ON vo.id = oi.vendor_order_id
             WHERE vo.order_id = ?
             FOR UPDATE`,
            [payment.orderId],
          )
        : [[], []];

      const quantitiesByProduct = new Map();
      const quantitiesByBranchProduct = new Map();
      const productStockModes = new Map();

      for (const item of items) {
        const productId = Number(item.productId);
        const quantity = Number(item.quantity);
        const branchId = item.branchId == null ? null : Number(item.branchId);
        const key = `${productId}`;
        quantitiesByProduct.set(key, (quantitiesByProduct.get(key) ?? 0) + quantity);
        if (branchId !== null) {
          const branchKey = `${branchId}:${productId}`;
          const current = quantitiesByBranchProduct.get(branchKey) ?? {
            branchId,
            productId,
            quantity: 0,
          };
          current.quantity += quantity;
          quantitiesByBranchProduct.set(branchKey, current);
        }
      }

      let inventoryAvailable = orderCanBeFulfilled;

      for (const productId of quantitiesByProduct.keys()) {
        const [products] = await connection.execute(
          `SELECT
              id,
              track_stock AS trackStock,
              stock_on_hand AS stockOnHand
           FROM products
           WHERE id = ?
           FOR UPDATE`,
          [Number(productId)],
        );
        const product = products[0];
        if (!product) {
          inventoryAvailable = false;
          break;
        }
        productStockModes.set(Number(productId), Number(product.trackStock) === 1);
      }

      if (inventoryAvailable) {
        for (const entry of quantitiesByBranchProduct.values()) {
          if (!productStockModes.get(entry.productId)) continue;
          const [inventoryRows] = await connection.execute(
            `SELECT stock_on_hand AS stockOnHand
             FROM branch_product_inventory
             WHERE branch_id = ? AND product_id = ?
             FOR UPDATE`,
            [entry.branchId, entry.productId],
          );
          if (!inventoryRows[0]) {
            inventoryAvailable = false;
            break;
          }
          const stockBefore = Number(inventoryRows[0].stockOnHand);
          const [otherReservations] = await connection.execute(
            `SELECT quantity
             FROM stock_reservations
             WHERE branch_id = ?
               AND product_id = ?
               AND order_id <> ?
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
            [entry.branchId, entry.productId, payment.orderId],
          );
          const reservedForOtherOrders = otherReservations.reduce(
            (sum, reservation) => sum + Number(reservation.quantity),
            0,
          );
          if (stockBefore - reservedForOtherOrders < entry.quantity) {
            inventoryAvailable = false;
            break;
          }
          entry.stockBefore = stockBefore;
        }
      }

      // Orders created before branch fulfilment was introduced retain a NULL
      // branch id and continue through the legacy product-level stock path.
      if (inventoryAvailable) {
        const legacyQuantities = new Map();
        for (const item of items) {
          if (item.branchId != null || !productStockModes.get(Number(item.productId))) continue;
          const id = Number(item.productId);
          legacyQuantities.set(id, (legacyQuantities.get(id) ?? 0) + Number(item.quantity));
        }
        
        for (const [productId, quantity] of legacyQuantities) {
          const [products] = await connection.execute(
            `SELECT
                id,
                track_stock AS trackStock,
                stock_on_hand AS stockOnHand
            FROM products
            WHERE id = ?
            FOR UPDATE`,
            [productId],
          );

          if (!products[0]) {
            inventoryAvailable = false;
            break;
          }

          const stockOnHand = Number(products[0].stockOnHand);

          const [otherReservations] = await connection.execute(
            `SELECT quantity
            FROM stock_reservations
            WHERE product_id = ?
              AND branch_id IS NULL
              AND order_id <> ?
              AND status = 'active'
              AND (
                expires_at > UTC_TIMESTAMP(3)
                OR EXISTS (
                  SELECT 1
                  FROM payment_transactions pt
                  WHERE pt.order_id = stock_reservations.order_id
                    AND pt.status IN ('initializing', 'initialized')
                )
              )
            FOR UPDATE`,
            [productId, payment.orderId],
          );

  const reservedForOtherOrders = otherReservations.reduce(
    (sum, reservation) => sum + Number(reservation.quantity),
    0,
  );

    if (stockOnHand - reservedForOtherOrders < quantity) {
    inventoryAvailable = false;
    break;
  }
}
}

const nextOrderStatus = inventoryAvailable
        ? 'confirmed'
        : 'payment_review';

      if (inventoryAvailable) {
        for (const entry of quantitiesByBranchProduct.values()) {
          if (!productStockModes.get(entry.productId)) continue;
          const stockAfter = entry.stockBefore - entry.quantity;
          const [updateResult] = await connection.execute(
            `UPDATE branch_product_inventory
             SET stock_on_hand = stock_on_hand - ?,
                 updated_at = UTC_TIMESTAMP(3)
             WHERE branch_id = ?
               AND product_id = ?
               AND stock_on_hand >= ?`,
            [entry.quantity, entry.branchId, entry.productId, entry.quantity],
          );
          if (Number(updateResult.affectedRows) !== 1) {
            throw conflict('Branch inventory changed while settling this payment.');
          }
          await connection.execute(
            `INSERT INTO inventory_movements (
                public_id, vendor_id, branch_id, product_id,
                movement_type, quantity_delta, quantity_before,
                quantity_after, reference_type, reference_id, actor_user_id
             )
             SELECT ?, p.vendor_id, ?, p.id, 'sale', ?, ?, ?, 'order', ?, NULL
             FROM products p WHERE p.id = ?`,
            [
              ulid(),
              entry.branchId,
              -entry.quantity,
              entry.stockBefore,
              stockAfter,
              payment.orderPublicId,
              entry.productId,
            ],
          );
        }

        const legacyQuantities = new Map();
        for (const item of items) {
          if (item.branchId != null || !productStockModes.get(Number(item.productId))) continue;
          const id = Number(item.productId);
          legacyQuantities.set(id, (legacyQuantities.get(id) ?? 0) + Number(item.quantity));
        }
        for (const [productId, quantity] of legacyQuantities) {
          const [updateResult] = await connection.execute(
            `UPDATE products
             SET stock_on_hand = stock_on_hand - ?,
                 updated_at = UTC_TIMESTAMP(3)
             WHERE id = ?
               AND track_stock = 1
               AND stock_on_hand >= ?`,
            [quantity, productId, quantity],
          );
          if (Number(updateResult.affectedRows) !== 1) {
            throw conflict('Inventory changed while settling this payment.');
          }
        }
      }

      if (inventoryAvailable) {
        await connection.execute(
          `UPDATE stock_reservations
           SET status = 'consumed',
               updated_at = UTC_TIMESTAMP(3)
           WHERE order_id = ?
             AND status = 'active'`,
          [payment.orderId],
        );
      } else {
        await connection.execute(
          `UPDATE stock_reservations
           SET status = 'released',
               updated_at = UTC_TIMESTAMP(3)
           WHERE order_id = ?
             AND status = 'active'`,
          [payment.orderId],
        );
      }

      const gatewayData = gatewayDataOf(gatewayResponse);

      await connection.execute(
        `UPDATE payment_transactions
         SET status = 'success',
             provider_transaction_id = ?,
             gateway_response = ?,
             paid_at = UTC_TIMESTAMP(3),
             verified_at = UTC_TIMESTAMP(3),
             failure_reason = NULL,
             updated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [
          gatewayData?.id
            ? String(gatewayData.id)
            : null,
          JSON.stringify(gatewayResponse),
          payment.paymentId,
        ],
      );

      await connection.execute(
        `UPDATE orders
         SET payment_status = 'paid',
             status = ?,
             updated_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [
          nextOrderStatus,
          payment.orderId,
        ],
      );

      await connection.execute(
        `INSERT INTO audit_log (
            actor_user_id,
            actor_role,
            action,
            entity_type,
            entity_id,
            after_json
         )
         VALUES (
            NULL,
            'system',
            ?,
            'payment',
            ?,
            ?
         )`,
        [
          inventoryAvailable
            ? 'payment.settled'
            : 'payment.inventory_review',
          String(payment.paymentId),
          JSON.stringify({
            reference: payment.reference,
            paymentStatus: 'success',
            orderStatus: nextOrderStatus,
            inventoryAvailable,
            reviewReason: orderCanBeFulfilled
              ? (inventoryAvailable ? null : 'insufficient_inventory')
              : 'order_not_payable',
          }),
        ],
      );

      return {
        verified: true,
        alreadySettled: false,
        paymentStatus: 'success',
        orderStatus: nextOrderStatus,
        inventoryAvailable,
        reference: payment.reference,
      };
    });
  }

  async function verifyAndSettle(reference) {
    if (!reference) {
      throw badRequest('Payment reference is required.');
    }

    const payment = await loadPayment(reference);

    if (!payment) {
      throw notFound('Payment transaction not found.');
    }

    if (payment.paymentStatus === 'success') {
      return {
        verified: true,
        alreadySettled: true,
        paymentStatus: 'success',
        orderStatus: payment.orderStatus,
        inventoryAvailable: true,
        reference,
      };
    }

    if (
      payment.paymentStatus !== 'initialized' &&
      payment.paymentStatus !== 'initializing'
    ) {
      throw conflict(
        'This payment is not available for verification.',
      );
    }

    const response = await paystack.verify(reference);
    const data = gatewayDataOf(response);

    const gatewayStatus = gatewayStatusOf(response);

    const verifiedReference = data?.reference;
    const verifiedAmount = Number(data?.amount);
    const verifiedCurrency = String(data?.currency ?? '').toUpperCase();

    if (
      verifiedReference !== reference ||
      verifiedAmount !== Number(payment.amountKobo) ||
      verifiedCurrency !== String(payment.currency).toUpperCase()
    ) {
      throw conflict(
        'Paystack verification details do not match this payment.',
      );
    }

    if (gatewayStatus === 'success') {
      return settleSuccessfulPayment(payment, response);
    }

    if (
      gatewayStatus === 'failed' ||
      gatewayStatus === 'abandoned'
    ) {
      return recordUnsuccessfulPayment(
        payment,
        gatewayStatus,
        response,
      );
    }

    return {
      verified: false,
      paymentStatus: gatewayStatus,
      retryAllowed: false,
      reference,
    };
  }

  async function handleWebhook(event) {
    const reference = event?.data?.reference;

    if (!reference) {
      throw badRequest(
        'Paystack webhook is missing its payment reference.',
      );
    }

    return verifyAndSettle(reference);
  }

  async function verify(userId, orderPublicId, reference) {
    const [rows] = await pool.execute(
      `SELECT
          pt.reference
       FROM payment_transactions pt
       JOIN orders o ON o.id = pt.order_id
       WHERE pt.reference = ?
         AND o.public_id = ?
         AND o.user_id = ?
       LIMIT 1`,
      [
        reference,
        orderPublicId,
        userId,
      ],
    );

    if (!rows[0]) {
      throw notFound('Payment transaction not found.');
    }

    return verifyAndSettle(reference);
  }

  return {
    preparePayment,
    initialize,
    verify,
    handleWebhook,
  };
}