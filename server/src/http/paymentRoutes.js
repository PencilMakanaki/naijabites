import { Router } from 'express';
import { createPaystackClient } from '../payments/paystack.js';
import { createPaymentService } from '../payments/service.js';
import { requireRole } from './authMiddleware.js';
import { AppError, badRequest } from './errors.js';
import { ok } from './respond.js';

export function paymentRoutes({ pool, config }) {
  const router = Router();

  router.use(requireRole('customer'));

  const payments = config.paystack.enabled
    ? createPaymentService({
        pool,
        paystack: createPaystackClient({
          secretKey: config.paystack.secretKey,
        }),
        clientOrigin: config.clientOrigin,
      })
    : null;

  // Validate order ID.
  function validateOrderId(orderId) {
    if (
      typeof orderId !== 'string' ||
      !/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(orderId)
    ) {
      throw badRequest('A valid order ID is required.');
    }
  }

  // POST /me/checkout/:orderId/payment
  // Initialize a Paystack payment.
  router.post('/:orderId/payment', async (req, res) => {
    if (!payments) {
      throw new AppError(
        503,
        'payment_unavailable',
        'Online payment is not currently available.',
      );
    }

    const { orderId } = req.params;

    validateOrderId(orderId);

    const payment = await payments.initialize(
      req.auth.user.id,
      orderId,
    );

    return ok(res, payment);
  });

  // POST /me/checkout/:orderId/payment/verify
  // Verify an existing Paystack transaction.
  router.post(
    '/:orderId/payment/verify',
    async (req, res) => {
      if (!payments) {
        throw new AppError(
          503,
          'payment_unavailable',
          'Online payment is not currently available.',
        );
      }

      const { orderId } = req.params;
      const { reference } = req.body || {};

      validateOrderId(orderId);

      if (
        typeof reference !== 'string' ||
        reference.length > 100
      ) {
        throw badRequest(
          'A valid payment reference is required.',
        );
      }

      const verification = await payments.verify(
        req.auth.user.id,
        orderId,
        reference,
      );

      return ok(res, verification);
    },
  );

  return router;
}