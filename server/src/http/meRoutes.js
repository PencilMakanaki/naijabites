import { Router } from 'express';
import { emailChangeSchema, profileSchema } from '@naijabites/shared/schemas';
import { listSessions, requestEmailChange, revokeOneSession, revokeOtherSessions, updateProfile } from '../auth/accounts.js';
import { requireAuth } from './authMiddleware.js';
import { limiter } from './rateLimit.js';
import { ok } from './respond.js';
import { validateBody } from './validate.js';

export function meRoutes({ pool, config }) {
  const router = Router();
  router.use(requireAuth);
  const emailChangeLimit = limiter({ windowMs: 60 * 60 * 1000, limit: 5, message: 'Too many attempts. Please try again later.' });

  router.patch('/profile', validateBody(profileSchema), async (req, res) => {
    ok(res, { user: await updateProfile(pool, req.auth.user.id, req.body) });
  });

  router.post('/email-change', emailChangeLimit, validateBody(emailChangeSchema), async (req, res) => {
    await requestEmailChange(pool, config, { userId: req.auth.user.id, newEmail: req.body.newEmail, password: req.body.password });
    ok(res, { status: 'sent' }, undefined, 202);
  });

  router.get('/sessions', async (req, res) => {
    ok(res, await listSessions(pool, req.auth.user.id, req.auth.tokenHash));
  });

  router.delete('/sessions/:id', async (req, res) => {
    await revokeOneSession(pool, req.auth.user.id, req.params.id, req.auth.tokenHash);
    res.status(204).end();
  });

  router.delete('/sessions', async (req, res) => {
    await revokeOtherSessions(pool, req.auth.user.id, req.auth.tokenHash);
    res.status(204).end();
  });

  return router;
}
