import { Router } from 'express';
import { createVendorProductService } from '../catalogue/vendorProducts.js';
import { requireRole } from './authMiddleware.js';
import { badRequest } from './errors.js';
import { ok } from './respond.js';

export function vendorProductRoutes({ pool }) {
  const router = Router(); const service = createVendorProductService({ pool });
  router.use(requireRole('vendor'));
  router.get('/', async (req, res, next) => { try { return ok(res, await service.list(req.auth.user.id)); } catch (e) { return next(e); } });
  router.post('/', async (req, res, next) => { try { return ok(res, await service.create(req.auth.user.id, req.body), undefined, 201); } catch (e) { return next(e); } });
  router.get('/images/search', async (req, res, next) => { try { return ok(res, await service.searchImages(req.query.q)); } catch (e) { return next(e); } });
  router.put('/:id/media', async (req, res, next) => { try { return ok(res, await service.setMedia(req.auth.user.id, req.params.id, req.body)); } catch (e) { return next(e); } });
  router.patch('/:id', async (req, res, next) => { try { return ok(res, await service.update(req.auth.user.id, req.params.id, req.body)); } catch (e) { return next(e); } });
  router.post('/:id/publish', async (req, res, next) => { try { if (typeof req.body?.isPublished !== 'boolean') throw badRequest('isPublished must be true or false.'); return ok(res, await service.setPublished(req.auth.user.id, req.params.id, req.body.isPublished)); } catch (e) { return next(e); } });
  router.delete('/:id', async (req, res, next) => { try { return ok(res, await service.archive(req.auth.user.id, req.params.id)); } catch (e) { return next(e); } });
  return router;
}
