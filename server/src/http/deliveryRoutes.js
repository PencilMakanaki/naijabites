import { Router } from 'express';
import { createDeliveryService } from '../delivery/service.js';
import {
  deliveryZoneSchema,
  deliveryZoneUpdateSchema,
  deliveryZoneStatusSchema,
} from '../delivery/schemas.js';
import { requireRole } from './authMiddleware.js';
import { notFound } from './errors.js';
import { ok } from './respond.js';
import { validateBody } from './validate.js';

const validId = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export function deliveryRoutes({
  pool,
  delivery = createDeliveryService({ pool }),
}) {
  const router = Router();

  router.use(requireRole('admin'));

  function requestInfo(req) {
    return {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };
  }

  router.get('/', async (req, res) => {
    const zones = await delivery.list();
    return ok(res, zones);
  });

  router.post(
    '/',
    validateBody(deliveryZoneSchema),
    async (req, res) => {
      const zone = await delivery.create(
        req.auth.user.id,
        req.body,
        requestInfo(req),
      );

      return ok(res, zone, undefined, 201);
    },
  );

  router.patch(
    '/:id',
    validateBody(deliveryZoneUpdateSchema),
    async (req, res) => {
      if (!validId.test(req.params.id)) {
        throw notFound('Delivery zone not found.');
      }

      const zone = await delivery.update(
        req.auth.user.id,
        req.params.id,
        req.body,
        requestInfo(req),
      );

      return ok(res, zone);
    },
  );

  router.patch(
    '/:id/status',
    validateBody(deliveryZoneStatusSchema),
    async (req, res) => {
      if (!validId.test(req.params.id)) {
        throw notFound('Delivery zone not found.');
      }

      const zone = await delivery.setStatus(
        req.auth.user.id,
        req.params.id,
        req.body.status,
        requestInfo(req),
      );

      return ok(res, zone);
    },
  );

  return router;
}