import { SESSION_COOKIE, createSession, sessionTtlMs } from '../auth/sessions.js';
import { serializeCookie } from './cookies.js';
import { CSRF_COOKIE, createCsrfToken } from './csrf.js';

export function issueCsrfCookie(res, config) {
  const token = createCsrfToken(config.csrfSecret);
  res.append('Set-Cookie', serializeCookie(CSRF_COOKIE, token, { httpOnly: true, secure: config.isProduction, sameSite: 'Lax' }));
  return token;
}

/** Creates the session, sets the session cookie, and returns a fresh CSRF token for the new session. */
export async function startSession({ req, res, pool, config, userId, area }) {
  const ttlMs = sessionTtlMs(area, config.session);
  const { token } = await createSession(pool, { userId, area, ip: req.ip, userAgent: req.get('user-agent'), ttlMs });
  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'Lax',
    ...(area === 'customer' ? { maxAgeSeconds: ttlMs / 1000 } : {}), // staff cookies end with the browser session
  }));
  return issueCsrfCookie(res, config);
}
