import { withTransaction } from '../db/pool.js';
import { ulid } from '../security/ids.js';
import { AppError, badRequest, conflict, notFound } from '../http/errors.js';

const ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

function safeAmount(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError(500, 'invalid_payment_amount', 'The payment amount is invalid.');
  }
  return amount;
}

export function createAdminPaymentService({ pool, paystack }) {
  if (!pool || !paystack) throw new Error('Admin payment service dependencies are required.');

  async function list({ status, limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const where = status === 'review' ? "WHERE o.status = 'payment_review'" : status ? 'WHERE pt.status = ?' : '';
    const params = status && status !== 'review' ? [status] : [];
    const [rows] = await pool.execute(
      `SELECT pt.public_id AS id, pt.reference, pt.status AS paymentStatus,
              pt.amount_kobo AS amountKobo, pt.currency, pt.failure_reason AS failureReason,
              pt.created_at AS createdAt, pt.paid_at AS paidAt,
              o.public_id AS orderId, o.status AS orderStatus, o.payment_status AS orderPaymentStatus,
              u.email AS customerEmail, u.full_name AS customerName
       FROM payment_transactions pt
       JOIN orders o ON o.id = pt.order_id
       JOIN users u ON u.id = o.user_id
       ${where}
       ORDER BY pt.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params,
    );
    return rows.map((row) => ({ ...row, amountKobo: Number(row.amountKobo) }));
  }

  async function get(publicId) {
    if (!ID_PATTERN.test(publicId || '')) throw notFound('Payment not found.');
    const [rows] = await pool.execute(
      `SELECT pt.public_id AS id, pt.reference, pt.provider_transaction_id AS providerTransactionId,
              pt.status AS paymentStatus, pt.amount_kobo AS amountKobo, pt.currency,
              pt.gateway_response AS gatewayResponse, pt.failure_reason AS failureReason,
              pt.created_at AS createdAt, pt.paid_at AS paidAt, pt.verified_at AS verifiedAt,
              o.public_id AS orderId, o.status AS orderStatus, o.payment_status AS orderPaymentStatus,
              u.email AS customerEmail, u.full_name AS customerName
       FROM payment_transactions pt JOIN orders o ON o.id = pt.order_id
       JOIN users u ON u.id = o.user_id WHERE pt.public_id = ? LIMIT 1`,
      [publicId],
    );
    if (!rows[0]) throw notFound('Payment not found.');
    const [refunds] = await pool.execute(
      `SELECT pr.public_id AS id, pr.amount_kobo AS amountKobo, pr.currency, pr.reason,
              pr.status, pr.provider_status AS providerStatus, pr.failure_reason AS failureReason,
              pr.created_at AS createdAt, pr.processed_at AS processedAt
       FROM payment_refunds pr JOIN payment_transactions pt ON pt.id = pr.payment_id
       WHERE pt.public_id = ? ORDER BY pr.created_at DESC`, [publicId],
    );
    return {
      ...rows[0], amountKobo: Number(rows[0].amountKobo),
      refunds: refunds.map((refund) => ({ ...refund, amountKobo: Number(refund.amountKobo) })),
    };
  }

  async function requestFullRefund(adminUserId, paymentPublicId, reason, requestInfo = {}) {
    if (!ID_PATTERN.test(paymentPublicId || '')) throw notFound('Payment not found.');
    if (typeof reason !== 'string' || reason.trim().length < 10 || reason.trim().length > 500) {
      throw badRequest('Provide a refund reason between 10 and 500 characters.');
    }

    const prepared = await withTransaction(pool, async (conn) => {
      const [rows] = await conn.execute(
        `SELECT pt.id, pt.public_id AS publicId, pt.reference, pt.provider_transaction_id AS transactionId,
                pt.status AS paymentStatus, pt.amount_kobo AS amountKobo, pt.order_id AS orderId,
                o.public_id AS orderPublicId, o.payment_status AS orderPaymentStatus
         FROM payment_transactions pt JOIN orders o ON o.id = pt.order_id
         WHERE pt.public_id = ? LIMIT 1 FOR UPDATE`, [paymentPublicId],
      );
      const payment = rows[0];
      if (!payment) throw notFound('Payment not found.');
      if (payment.paymentStatus !== 'success' || payment.orderPaymentStatus !== 'paid' || !payment.transactionId) {
        throw conflict('Only a successfully verified and paid transaction can be refunded.', 'payment_not_refundable');
      }
      const [existing] = await conn.execute('SELECT public_id FROM payment_refunds WHERE payment_id = ? LIMIT 1', [payment.id]);
      if (existing[0]) throw conflict('A refund has already been requested for this payment.', 'refund_already_exists');

      const refundPublicId = ulid();
      await conn.execute(
        `INSERT INTO payment_refunds
         (public_id, payment_id, order_id, requested_by, amount_kobo, currency, reason, status)
         VALUES (?, ?, ?, ?, ?, 'NGN', ?, 'processing')`,
        [refundPublicId, payment.id, payment.orderId, adminUserId, safeAmount(payment.amountKobo), reason.trim()],
      );
      await conn.execute(
        `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, after_json, ip, user_agent)
         VALUES (?, 'admin', 'payment.refund_requested', 'payment', ?, ?, ?, ?)`,
        [adminUserId, payment.publicId, JSON.stringify({ refundId: refundPublicId, amountKobo: Number(payment.amountKobo), reason: reason.trim() }), requestInfo.ip ?? null, requestInfo.userAgent ?? null],
      );
      return { ...payment, refundPublicId, amountKobo: safeAmount(payment.amountKobo) };
    });

    try {
      const result = await paystack.refund({
        transaction: Number(prepared.transactionId),
        amountKobo: prepared.amountKobo,
        merchantNote: `NaijaBites refund ${prepared.refundPublicId}: ${reason.trim()}`,
        reference: prepared.refundPublicId,
      });
      const providerStatus = String(result?.status || 'pending').toLowerCase();
      const status = providerStatus === 'processed' ? 'processed'
        : ['failed', 'rejected'].includes(providerStatus) ? 'failed'
          : providerStatus === 'needs-attention' ? 'needs_review'
            : 'processing';
      await withTransaction(pool, async (conn) => {
        await conn.execute(
          `UPDATE payment_refunds SET provider_refund_id = ?, provider_status = ?, status = ?,
             processed_at = CASE WHEN ? = 'processed' THEN UTC_TIMESTAMP(3) ELSE processed_at END
           WHERE public_id = ? AND status = 'processing'`,
          [result?.id ?? null, providerStatus, status, status, prepared.refundPublicId],
        );
        if (status === 'processed') {
          await conn.execute("UPDATE orders SET payment_status = 'refunded' WHERE id = ? AND payment_status = 'paid'", [prepared.orderId]);
        }
        await conn.execute(
          `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, after_json)
           VALUES (?, 'admin', ?, 'payment', ?, ?)`,
          [adminUserId, status === 'processed' ? 'payment.refund_processed' : 'payment.refund_submitted', prepared.publicId, JSON.stringify({ refundId: prepared.refundPublicId, providerStatus })],
        );
      });
    } catch (error) {
      // A timeout may happen after Paystack accepted the refund. Never auto-retry it:
      // mark it for manual reconciliation to avoid issuing a duplicate refund.
      await pool.execute(
        `UPDATE payment_refunds SET status = 'needs_review', failure_reason = ?
         WHERE public_id = ? AND status = 'processing'`,
        ['Paystack response was inconclusive. Check the Paystack Dashboard before retrying.', prepared.refundPublicId],
      );
      await pool.execute(
        `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, after_json, ip, user_agent)
         VALUES (?, 'admin', 'payment.refund_needs_review', 'payment', ?, ?, ?, ?)`,
        [adminUserId, prepared.publicId, JSON.stringify({ refundId: prepared.refundPublicId, errorCode: error?.code || 'gateway_error' }), requestInfo.ip ?? null, requestInfo.userAgent ?? null],
      );
      throw new AppError(502, 'refund_needs_review', 'Paystack did not return a conclusive refund result. Check the Paystack Dashboard before attempting another refund.');
    }

    return get(paymentPublicId);
  }

  async function handleRefundWebhook(event) {
    const data = event?.data || {};
    const providerRefundId = data.id ?? null;
    const transactionReference = data.transaction_reference;
    if (!providerRefundId && !transactionReference) return { matched: false };
    const gatewayStatus = String(data.status || event.event.split('.')[1] || '').toLowerCase();
    const status = gatewayStatus === 'processed' ? 'processed'
      : ['failed', 'rejected'].includes(gatewayStatus) ? 'failed'
        : gatewayStatus === 'needs-attention' ? 'needs_review'
          : 'processing';

    return withTransaction(pool, async (conn) => {
      const [rows] = await conn.execute(
        `SELECT pr.id, pr.public_id AS publicId, pr.order_id AS orderId,
                pr.status, pt.public_id AS paymentPublicId
         FROM payment_refunds pr JOIN payment_transactions pt ON pt.id = pr.payment_id
         WHERE (pr.provider_refund_id = ? OR pt.reference = ?) LIMIT 1 FOR UPDATE`,
        [providerRefundId, transactionReference ?? null],
      );
      const refund = rows[0];
      if (!refund) return { matched: false };
      if (['processed', 'failed'].includes(refund.status)) return { matched: true, duplicate: true };

      await conn.execute(
        `UPDATE payment_refunds SET provider_status = ?, status = ?,
           processed_at = CASE WHEN ? = 'processed' THEN UTC_TIMESTAMP(3) ELSE processed_at END,
           failure_reason = CASE WHEN ? = 'failed' THEN 'Paystack reported that the refund failed.' WHEN ? = 'needs_review' THEN 'Paystack needs additional attention to complete this refund.' ELSE NULL END
         WHERE id = ?`,
        [gatewayStatus, status, status, status, status, refund.id],
      );
      if (status === 'processed') {
        await conn.execute("UPDATE orders SET payment_status = 'refunded' WHERE id = ? AND payment_status = 'paid'", [refund.orderId]);
      }
      await conn.execute(
        `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, after_json)
         VALUES (NULL, 'system', ?, 'payment', ?, ?)`,
        [status === 'processed' ? 'payment.refund_processed' : status === 'failed' ? 'payment.refund_failed' : status === 'needs_review' ? 'payment.refund_needs_attention' : 'payment.refund_updated', refund.paymentPublicId, JSON.stringify({ refundId: refund.publicId, providerStatus: gatewayStatus })],
      );
      return { matched: true, status };
    });
  }

  return { list, get, requestFullRefund, handleRefundWebhook };
}
