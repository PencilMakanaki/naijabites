import { Router } from 'express';
import { createPaystackClient } from '../payments/paystack.js';
import { createPaymentService } from '../payments/service.js';
import { verifyPaystackWebhook } from '../payments/webhook.js';

export function paystackWebhookRoutes({ pool, config, logger }) {
  const router = Router();

  const payments = config.paystack.enabled
    ? createPaymentService({
        pool,
        paystack: createPaystackClient({
          secretKey: config.paystack.secretKey,
        }),
        clientOrigin: config.clientOrigin,
      })
    : null;

  router.post('/', async (req, res, next) => {
    try {
      if (!payments) {
        return res.status(503).json({
          error: { code: 'payment_unavailable', message: 'Payment processing is unavailable.' },
        });
      }

      const validSignature = verifyPaystackWebhook({
        rawBody: req.body,
        headers: req.headers,
        webhookSecret: config.paystack.webhookSecret,
        secretKey: config.paystack.secretKey,
      });

      if (!validSignature) {
        logger.warn({ requestId: req.id }, 'Rejected Paystack webhook: invalid signature');
        return res.status(401).json({
          error: { code: 'invalid_webhook_signature', message: 'Invalid webhook signature.' },
        });
      }

      let event;
      try {
        event = JSON.parse(req.body.toString('utf8'));
      } catch {
        return res.status(400).json({
          error: { code: 'invalid_webhook_payload', message: 'Invalid webhook payload.' },
        });
      }

      if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.event !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_webhook_event', message: 'Invalid webhook event.' },
        });
      }

      if (['charge.success', 'charge.failed'].includes(event.event)) {
        await payments.handleWebhook(event);
      } else if (['refund.pending', 'refund.processing', 'refund.processed', 'refund.failed', 'refund.needs-attention'].includes(event.event)) {
        // Refund status events are reconciled by the admin refund service.
        const { createAdminPaymentService } = await import('../payments/adminService.js');
        const adminPayments = createAdminPaymentService({
          pool,
          paystack: createPaystackClient({ secretKey: config.paystack.secretKey }),
        });
        await adminPayments.handleRefundWebhook(event);
      }

      // Acknowledge valid but currently unhandled event types. Paystack should
      // not keep retrying events that do not affect this payment workflow.
      return res.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}