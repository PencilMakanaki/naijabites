import { hashToken, newToken } from '../security/tokens.js';

export const SESSION_COOKIE = 'nb_session';
const TOUCH_AFTER_MS = 5 * 60 * 1000; // refresh "last seen" at most every 5 minutes

export function sessionTtlMs(area, sessionConfig) {
  return area === 'customer'
    ? sessionConfig.customerDays * 24 * 60 * 60 * 1000
    : sessionConfig.staffHours * 60 * 60 * 1000;
}

export async function createSession(pool, { userId, area, ip, userAgent, ttlMs }) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + ttlMs);
  await pool.execute(
    'INSERT INTO auth_sessions (user_id, token_hash, area, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, hashToken(token), area, ip ? String(ip).slice(0, 45) : null, userAgent ? String(userAgent).slice(0, 255) : null, expiresAt],
  );
  return { token, expiresAt };
}

/** Finds a valid session for a cookie token, or null. Slides the expiry forward while it is in use. */
export async function loadSession(pool, token, sessionConfig) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const [rows] = await pool.execute(
    `SELECT s.id AS session_id, s.token_hash, s.area, s.last_seen_at,
            u.id AS user_id, u.public_id, u.full_name, u.email, u.phone, u.email_verified_at,
            (SELECT GROUP_CONCAT(r.role) FROM user_roles r WHERE r.user_id = u.id) AS roles
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > UTC_TIMESTAMP(3)
        AND u.status = 'active'
        AND u.deleted_at IS NULL
      LIMIT 1`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_AFTER_MS) {
    const expiresAt = new Date(Date.now() + sessionTtlMs(row.area, sessionConfig));
    await pool.execute('UPDATE auth_sessions SET last_seen_at = UTC_TIMESTAMP(3), expires_at = ? WHERE id = ?', [expiresAt, row.session_id]);
  }
  return {
    sessionId: row.session_id,
    tokenHash: row.token_hash,
    area: row.area,
    user: {
      id: row.user_id,
      publicId: row.public_id,
      name: row.full_name,
      email: row.email,
      phone: row.phone,
      emailVerified: row.email_verified_at !== null,
      roles: row.roles ? row.roles.split(',') : [],
    },
  };
}

export async function revokeSession(pool, token) {
  await pool.execute('UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE token_hash = ? AND revoked_at IS NULL', [hashToken(token)]);
}
