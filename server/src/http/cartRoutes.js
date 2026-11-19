import { Router } from 'express';
import { createCartService } from '../cart/service.js';
import { addCartItemSchema, cartQuantitySchema } from '../cart/schemas.js';
import { requireRole } from './authMiddleware.js';
import { notFound } from './errors.js';
import { ok } from './respond.js';
import { validateBody } from './validate.js';

export function cartRoutes({ pool, cart = createCartService({ pool }) }) {
  const router = Router();
  router.use(requireRole('customer'));

  router.get('/', async (req, res) => ok(res, await cart.get(req.auth.user.id)));
  router.post('/items', validateBody(addCartItemSchema), async (req, res) => {
    ok(res, await cart.add(req.auth.user.id, req.body.productId, req.body.quantity), undefined, 201);
  });
  router.patch('/items/:productId', validateBody(cartQuantitySchema), async (req, res) => {
    if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(req.params.productId)) throw notFound();
    ok(res, await cart.setQuantity(req.auth.user.id, req.params.productId, req.body.quantity));
  });
  router.delete('/items/:productId', async (req, res) => {
    if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(req.params.productId)) throw notFound();
    ok(res, await cart.remove(req.auth.user.id, req.params.productId));
  });
  router.delete('/', async (req, res) => ok(res, await cart.clear(req.auth.user.id)));
  return router;
}
