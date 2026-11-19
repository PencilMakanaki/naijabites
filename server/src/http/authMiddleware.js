import { loadSession, SESSION_COOKIE } from '../auth/sessions.js';
import { forbidden, unauthenticated } from './errors.js';

/** Reads the session cookie (if any) and sets req.auth = { user, area, sessionId } or null. */
export function sessionLoader({ pool, config }) {
  return async (req, res, next) => {
    req.auth = null;
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) req.auth = await loadSession(pool, token, config.session);
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.auth) return next(unauthenticated());
  next();
}

/** The person must hold the role AND have signed in through that area (customer, vendor, rider, admin). */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.auth) return next(unauthenticated());
    if (req.auth.area !== role || !req.auth.user.roles.includes(role)) return next(forbidden());
    next();
  };
}
