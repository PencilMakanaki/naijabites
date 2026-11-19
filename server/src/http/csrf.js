import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from '../security/tokens.js';
import { AppError } from './errors.js';

export const CSRF_COOKIE = 'nb_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const sign = (value, secret) => createHmac('sha256', secret).update(value).digest('base64url');

export function createCsrfToken(secret) {
  const value = randomBytes(24).toString('base64url');
  return `${value}.${sign(value, secret)}`;
}

export function isValidCsrfToken(token, secret) {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  return safeEqual(token.slice(dot + 1), sign(token.slice(0, dot), secret));
}

export function originOf(value) {
  try { return new URL(value).origin; } catch { return null; }
}

/**
 * Unsafe requests must come from our own site (Origin or Referer) and carry a signed token
 * both in the header and in the cookie (double submit). Returns { ok } or { ok: false, reason }.
 */
export function checkCsrf({ method, headers, cookies, secret, appOrigin }) {
  if (SAFE_METHODS.has(String(method).toUpperCase())) return { ok: true };
  const origin = headers.origin ?? originOf(headers.referer ?? '');
  if (!origin || origin !== appOrigin) return { ok: false, reason: 'origin' };
  const headerToken = headers[CSRF_HEADER];
  const cookieToken = cookies[CSRF_COOKIE];
  if (!headerToken || !cookieToken || !safeEqual(headerToken, cookieToken) || !isValidCsrfToken(headerToken, secret)) {
    return { ok: false, reason: 'token' };
  }
  return { ok: true };
}

export function csrfProtection({ secret, appOrigin, exemptPaths = [] }) {
  const exempt = new Set(exemptPaths);
  return (req, res, next) => {
    if (exempt.has(req.path)) return next();
    const result = checkCsrf({ method: req.method, headers: req.headers, cookies: req.cookies, secret, appOrigin });
    if (!result.ok) {
      return next(new AppError(403, 'csrf_failed', 'Your session expired. Refresh the page and try again.'));
    }
    next();
  };
}
