import { Router } from 'express';
import { createAddressService } from '../addresses/service.js';
import { addressSchema, addressUpdateSchema } from '../addresses/schemas.js';
import { requireRole } from './authMiddleware.js';
import { notFound } from './errors.js';
import { ok } from './respond.js';
import { validateBody } from './validate.js';

const validId = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
export function addressRoutes({ pool, addresses = createAddressService({ pool }) }) {
  const router = Router();
  router.use(requireRole('customer'));
  router.get('/', async (req, res) => ok(res, await addresses.list(req.auth.user.id)));
  router.post('/', validateBody(addressSchema), async (req, res) => ok(res, await addresses.create(req.auth.user.id, req.body), undefined, 201));
  router.patch('/:id', validateBody(addressUpdateSchema), async (req, res) => {
    if (!validId.test(req.params.id)) throw notFound('Delivery address not found.');
    ok(res, await addresses.update(req.auth.user.id, req.params.id, req.body));
  });
  router.post('/:id/default', async (req, res) => {
    if (!validId.test(req.params.id)) throw notFound('Delivery address not found.');
    ok(res, await addresses.setDefault(req.auth.user.id, req.params.id));
  });
  router.delete('/:id', async (req, res) => {
    if (!validId.test(req.params.id)) throw notFound('Delivery address not found.');
    ok(res, await addresses.remove(req.auth.user.id, req.params.id));
  });
  return router;
}
