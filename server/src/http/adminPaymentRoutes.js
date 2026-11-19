import { Router } from 'express';
import { createPaystackClient } from '../payments/paystack.js';
import { createAdminPaymentService } from '../payments/adminService.js';
import { requireRole } from './authMiddleware.js';
import { AppError, badRequest, notFound } from './errors.js';
import { ok } from './respond.js';

const validId = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export function adminPaymentRoutes({ pool, config, payments }) {
  const router = Router();
  router.use(requireRole('admin'));

  const service = payments || (config.paystack.enabled
    ? createAdminPaymentService({
        pool,
        paystack: createPaystackClient({ secretKey: config.paystack.secretKey }),
      })
    : null);

  function requirePayments() {
    if (!service) throw new AppError(503, 'payment_unavailable', 'Paystack is not configured. Payment administration is unavailable.');
  }

  function requestInfo(req) {
    return { ip: req.ip, userAgent: req.get('user-agent') };
  }

  router.get('/', async (req, res) => {
    requirePayments();
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const allowed = ['initializing', 'initialized', 'success', 'failed', 'abandoned', 'review'];
    if (status && !allowed.includes(status)) throw badRequest('Unsupported payment status filter.');
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
      throw badRequest('Limit must be 1–100 and offset must be zero or greater.');
    }
    return ok(res, await service.list({ status, limit, offset }));
  });

  router.get('/:id', async (req, res) => {
    requirePayments();
    if (!validId.test(req.params.id)) throw notFound('Payment not found.');
    return ok(res, await service.get(req.params.id));
  });

  router.post('/:id/refund', async (req, res) => {
    requirePayments();
    if (!validId.test(req.params.id)) throw notFound('Payment not found.');
    const reason = req.body?.reason;
    if (typeof reason !== 'string') throw badRequest('A refund reason is required.');
    const payment = await service.requestFullRefund(req.auth.user.id, req.params.id, reason, requestInfo(req));
    return ok(res, payment, undefined, 202);
  });

  return router;
}
