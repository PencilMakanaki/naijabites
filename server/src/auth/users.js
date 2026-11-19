export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export async function findUserForLogin(pool, email) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.public_id, u.full_name, u.email, u.phone, u.password_hash, u.status, u.deleted_at,
            u.failed_login_count, u.locked_until, u.email_verified_at,
            (SELECT GROUP_CONCAT(r.role) FROM user_roles r WHERE r.user_id = u.id) AS roles
       FROM users u
      WHERE u.email = ?
      LIMIT 1`,
    [email],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, roles: row.roles ? row.roles.split(',') : [] };
}

export function isLocked(user, now = Date.now()) {
  return Boolean(user.locked_until) && new Date(user.locked_until).getTime() > now;
}

/** Counts a failed sign-in and locks the account for a while after too many. */
export async function recordFailedLogin(pool, user, now = Date.now()) {
  const lockExpired = user.locked_until && new Date(user.locked_until).getTime() <= now;
  const count = (lockExpired ? 0 : user.failed_login_count) + 1;
  const lockedUntil = count >= MAX_FAILED_LOGINS ? new Date(now + LOCK_MINUTES * 60 * 1000) : null;
  await pool.execute('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?', [count, lockedUntil, user.id]);
}

export async function recordSuccessfulLogin(pool, userId) {
  await pool.execute('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(3) WHERE id = ?', [userId]);
}

export async function replacePasswordHash(pool, userId, passwordHash) {
  await pool.execute('UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3) WHERE id = ?', [passwordHash, userId]);
}
