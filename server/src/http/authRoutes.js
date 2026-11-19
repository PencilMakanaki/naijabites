import { Router } from 'express';
import {
  changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, tokenSchema,
} from '@naijabites/shared/schemas';
import {
  changePassword, confirmEmailChange, registerCustomer, requestPasswordReset, resendVerification, resetPassword, verifyEmail,
} from '../auth/accounts.js';
import { SESSION_COOKIE, revokeSession } from '../auth/sessions.js';
import { findUserForLogin, isLocked, recordFailedLogin, recordSuccessfulLogin, replacePasswordHash } from '../auth/users.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../security/passwords.js';
import { clearCookie } from './cookies.js';
import { AppError, forbidden, unauthenticated } from './errors.js';
import { requireAuth } from './authMiddleware.js';
import { limiter } from './rateLimit.js';
import { ok } from './respond.js';
import { issueCsrfCookie, startSession } from './sessionCookies.js';
import { validateBody } from './validate.js';

const LOGIN_FAILED = 'Email or password is incorrect. After several failed attempts, sign-in is paused for 15 minutes.';
const HOUR = 60 * 60 * 1000;
const publicUser = (u) => ({ id: u.publicId, name: u.name, email: u.email, phone: u.phone ?? null, emailVerified: u.emailVerified, roles: u.roles });

export function authRoutes({ pool, config }) {
  const router = Router();
  const secure = config.isProduction;
  const loginLimit = limiter({ windowMs: 15 * 60 * 1000, limit: 10, message: 'Too many sign-in attempts. Please try again in a few minutes.' });
  const registerLimit = limiter({ windowMs: HOUR, limit: 5, message: 'Too many sign-up attempts from this connection. Please try again later.' });
  const forgotLimit = limiter({ windowMs: HOUR, limit: 10, message: 'Too many requests. Please try again later.' });
  const resendLimit = limiter({ windowMs: HOUR, limit: 3, message: 'We already sent you emails recently. Please check your inbox and spam folder.' });
  const passwordLimit = limiter({ windowMs: HOUR, limit: 10, message: 'Too many attempts. Please try again later.' });
  const tokenLimit = limiter({ windowMs: HOUR, limit: 30, message: 'Too many attempts. Please try again later.' });

  router.get('/csrf', (req, res) => {
    ok(res, { csrfToken: issueCsrfCookie(res, config) });
  });

  router.post('/register', registerLimit, validateBody(registerSchema), async (req, res) => {
    const { name, email, phone, password } = req.body;
    const { userId, publicId } = await registerCustomer(pool, config, { name, email, phone, password });
    const csrfToken = await startSession({ req, res, pool, config, userId, area: 'customer' });
    ok(res, {
      user: { id: publicId, name, email, phone: phone ?? null, emailVerified: false, roles: ['customer'] },
      area: 'customer',
      csrfToken,
    }, undefined, 201);
  });

  router.post('/login', loginLimit, validateBody(loginSchema), async (req, res) => {
    const { email, password, area } = req.body;
    const user = await findUserForLogin(pool, email);
    if (!user || user.status !== 'active' || user.deleted_at || isLocked(user)) {
      await burnPasswordCheck(password);
      throw new AppError(401, 'unauthenticated', LOGIN_FAILED);
    }
    const result = await verifyPassword(password, user.password_hash);
    if (!result.valid) {
      await recordFailedLogin(pool, user);
      throw new AppError(401, 'unauthenticated', LOGIN_FAILED);
    }
    if (!user.roles.includes(area)) throw forbidden('This account cannot sign in here.');
    if (result.needsRehash) await replacePasswordHash(pool, user.id, await hashPassword(password));
    await recordSuccessfulLogin(pool, user.id);
    const csrfToken = await startSession({ req, res, pool, config, userId: user.id, area });
    ok(res, {
      user: { id: user.public_id, name: user.full_name, email: user.email, phone: user.phone ?? null, emailVerified: user.email_verified_at !== null, roles: user.roles },
      area,
      csrfToken,
    });
  });

  router.post('/logout', async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await revokeSession(pool, token);
    res.append('Set-Cookie', clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: 'Lax' }));
    res.status(204).end();
  });

  router.get('/me', (req, res) => {
    if (!req.auth) throw unauthenticated();
    ok(res, { user: publicUser(req.auth.user), area: req.auth.area });
  });

  router.post('/verify-email', tokenLimit, validateBody(tokenSchema), async (req, res) => {
    await verifyEmail(pool, req.body.token);
    ok(res, { status: 'verified' });
  });

  router.post('/resend-verification', requireAuth, resendLimit, async (req, res) => {
    await resendVerification(pool, config, req.auth.user);
    ok(res, { status: 'sent' }, undefined, 202);
  });

  router.post('/forgot-password', forgotLimit, validateBody(forgotPasswordSchema), async (req, res) => {
    await requestPasswordReset(pool, config, req.body.email);
    ok(res, { status: 'sent' }, undefined, 202); // the same answer whether or not the email exists
  });

  router.post('/reset-password', tokenLimit, validateBody(resetPasswordSchema), async (req, res) => {
    await resetPassword(pool, req.body);
    res.append('Set-Cookie', clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: 'Lax' }));
    ok(res, { status: 'password_changed' });
  });

  router.post('/change-password', requireAuth, passwordLimit, validateBody(changePasswordSchema), async (req, res) => {
    await changePassword(pool, {
      userId: req.auth.user.id,
      currentSessionId: req.auth.sessionId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });
    ok(res, { status: 'password_changed' });
  });

  router.post('/confirm-email-change', tokenLimit, validateBody(tokenSchema), async (req, res) => {
    await confirmEmailChange(pool, req.body.token);
    ok(res, { status: 'email_changed' });
  });

  return router;
}
