import { Router } from 'express';
import { createOrderQueries } from '../orders/queries.js';
import { requireRole } from './authMiddleware.js';
import { badRequest } from './errors.js';
import { ok } from './respond.js';
import { createDispatchService } from '../deliveries/service.js';

const validId = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export function orderRoutes({
  pool,
  orders = createOrderQueries({ pool }),
}) {
  const router = Router();
  const dispatch = createDispatchService({ pool });

  router.use(requireRole('customer'));

  // GET /me/orders
  router.get('/', async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 10);

    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 50
    ) {
      throw badRequest('Invalid order history pagination.');
    }

    const result = await orders.list(req.auth.user.id, {
      page,
      pageSize,
    });

    return ok(res, result.orders, {
      pagination: result.pagination,
    });
  });

  router.get('/:id/delivery', async (req, res) => {
    if (!validId.test(req.params.id)) throw badRequest('Invalid order reference.');
    return ok(res, await dispatch.customerTracking(req.auth.user.id, req.params.id));
  });

  // GET /me/orders/:id
  router.get('/:id', async (req, res) => {
    if (!validId.test(req.params.id)) {
      throw badRequest('Invalid order reference.');
    }

    const order = await orders.getById(
      req.auth.user.id,
      req.params.id,
    );

    return ok(res, order);
  });

  return router;
}