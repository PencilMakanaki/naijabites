import { Router } from 'express';
import { createBranchInventoryService } from '../inventory/service.js';
import { requireRole } from './authMiddleware.js';
import { ok } from './respond.js';
import { badRequest } from './errors.js';

export function inventoryRoutes({ pool }) {
  const router = Router(); const inventory = createBranchInventoryService({ pool });
  router.use(requireRole('vendor'));
  router.get('/', async (req,res,next) => { try { return ok(res, await inventory.list(req.auth.user.id, { branchId: req.query.branchId, page: req.query.page, pageSize: req.query.pageSize })); } catch(e) { next(e); } });
  router.get('/movements', async (req,res,next) => { try { return ok(res, await inventory.movements(req.auth.user.id, req.query)); } catch(e) { next(e); } });
  router.post('/adjustments', async (req,res,next) => { try {
    const { branchId, productId, quantityDelta, movementType, note } = req.body || {};
    if (!Number.isSafeInteger(Number(branchId)) || Number(branchId) < 1 || typeof productId !== 'string') throw badRequest('A valid branchId and productId are required.');
    return ok(res, await inventory.adjust(req.auth.user.id, { branchId:Number(branchId), productId, quantityDelta:Number(quantityDelta), movementType, note }), undefined, 201);
  } catch(e) { next(e); } });
  return router;
}
