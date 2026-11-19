import express, { Router } from 'express';
import { createVendorOnboardingService, MAX_DOC_BYTES } from '../vendors/onboarding.js';
import { requireAuth, requireRole } from './authMiddleware.js';
import { ok } from './respond.js';

export function vendorApplicationRoutes({ pool }) {
  const router = Router();
  const service = createVendorOnboardingService({ pool });

  // GET /vendor-applications/mine  -> the signed-in person's application, or null
  router.get('/mine', requireAuth, async (req, res, next) => {
    try { return ok(res, await service.mine(req.auth.user.id)); } catch (e) { return next(e); }
  });

  // POST /vendor-applications  { businessName, contactName, contactPhone, description?, addressLine, area, city, state? }
  router.post('/', requireRole('customer'), async (req, res, next) => {
    try { return ok(res, await service.apply(req.auth.user.id, req.body), undefined, 201); } catch (e) { return next(e); }
  });

  // PUT /vendor-applications/documents/:type  - the file itself is the request body (PDF, JPG or PNG)
  router.put(
    '/documents/:type',
    requireRole('customer'),
    express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png'], limit: MAX_DOC_BYTES }),
    async (req, res, next) => {
      try {
        let originalName = '';
        try { originalName = decodeURIComponent(req.get('x-file-name') || ''); } catch { originalName = ''; }
        return ok(res, await service.saveDocument(req.auth.user.id, req.params.type, { buffer: req.body, originalName }));
      } catch (e) { return next(e); }
    },
  );

  return router;
}
