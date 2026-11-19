import { Router } from 'express';
import { createVendorReviewService } from '../vendors/review.js';
import { requireRole } from './authMiddleware.js';
import { ok } from './respond.js';

export function adminVendorRoutes({ pool }) {
  const router = Router();
  const service = createVendorReviewService({ pool });
  router.use(requireRole('admin'));

  // GET /admin/vendors?status=pending|approved|rejected|suspended|all
  router.get('/', async (req, res, next) => {
    try { return ok(res, await service.list(typeof req.query.status === 'string' ? req.query.status : 'pending')); } catch (e) { return next(e); }
  });

  // GET /admin/vendors/:id/documents/:type  -> the uploaded file (PDFs download; photos open in the browser)
  router.get('/:id/documents/:type', async (req, res, next) => {
    try {
      const doc = await service.document(req.params.id, req.params.type);
      res.set({
        'Content-Type': doc.mime,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `${doc.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      });
      return res.send(doc.content);
    } catch (e) { return next(e); }
  });

  // POST /admin/vendors/:id/decision  { decision: 'approve' | 'reject' | 'suspend' | 'reactivate', reason? }
  router.post('/:id/decision', async (req, res, next) => {
    try { return ok(res, await service.decide(req.auth.user.id, req.params.id, req.body?.decision, req.body?.reason)); } catch (e) { return next(e); }
  });

  return router;
}