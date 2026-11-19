import { Router } from 'express';
import { createVendorOrderService } from '../orders/vendorService.js';
import { requireRole } from './authMiddleware.js';
import { badRequest } from './errors.js';
import { ok } from './respond.js';

const ORDER_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function vendorOrderRoutes({ pool }) {
  const router = Router();
  const orders = createVendorOrderService({ pool });

  router.use(requireRole('vendor'));

  // GET /vendor/orders
  // List orders belonging to the authenticated vendor.
  router.get('/', async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);

      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > 50
      ) {
        throw badRequest('Invalid pagination parameters.');
      }

      const result = await orders.list(
        req.auth.user.id,
        { page, pageSize },
      );

      return ok(res, result.orders, result.pagination);
    } catch (error) {
      return next(error);
    }
  });

  // GET /vendor/orders/:id
  // Get one vendor order and its items.
  router.get('/:id', async (req, res, next) => {
    try {
      if (!ORDER_ID_PATTERN.test(req.params.id)) {
        throw badRequest('Invalid vendor order ID.');
      }

      const order = await orders.getById(
        req.auth.user.id,
        req.params.id,
      );

      return ok(res, order);
    } catch (error) {
      return next(error);
    }
  });

  // POST /vendor/orders/:id/accept
  router.post('/:id/accept', async (req, res, next) => {
    try {
      if (!ORDER_ID_PATTERN.test(req.params.id)) {
        throw badRequest('Invalid vendor order ID.');
      }

      const result = await orders.accept({
        userId: req.auth.user.id,
        orderPublicId: req.params.id,
        auditContext: {
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
      });

      return ok(res, result);
    } catch (error) {
      return next(error);
    }
  });

  // POST /vendor/orders/:id/reject
  router.post('/:id/reject', async (req, res, next) => {
    try {
      if (!ORDER_ID_PATTERN.test(req.params.id)) {
        throw badRequest('Invalid vendor order ID.');
      }

      const reason = req.body?.reason ?? null;

      if (
        reason !== null &&
        (typeof reason !== 'string' || reason.trim().length > 500)
      ) {
        throw badRequest(
          'Rejection reason must be text and cannot exceed 500 characters.',
        );
      }

      const result = await orders.reject({
        userId: req.auth.user.id,
        orderPublicId: req.params.id,
        reason: reason?.trim() || null,
        auditContext: {
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
      });

      return ok(res, result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}