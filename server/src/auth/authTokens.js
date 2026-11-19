import { hashToken, newToken } from '../security/tokens.js';

/** One-time tokens for emailed links. Only the hash is stored. A new token cancels older unused ones. */
export async function createAuthToken(db, { userId, purpose, ttlMinutes, newEmail = null }) {
  await db.execute('UPDATE auth_tokens SET used_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [userId, purpose]);
  const token = newToken();
  await db.execute(
    'INSERT INTO auth_tokens (user_id, purpose, token_hash, new_email, expires_at) VALUES (?, ?, ?, ?, ?)',
    [userId, purpose, hashToken(token), newEmail, new Date(Date.now() + ttlMinutes * 60 * 1000)],
  );
  return token;
}

/** Uses a token exactly once. Returns { userId, newEmail } or null when it is wrong, used or expired. */
export async function consumeAuthToken(db, token, purpose) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const hash = hashToken(token);
  const [result] = await db.execute(
    `UPDATE auth_tokens SET used_at = UTC_TIMESTAMP(3)
      WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(3)`,
    [hash, purpose],
  );
  if (result.affectedRows !== 1) return null;
  const [rows] = await db.execute('SELECT user_id, new_email FROM auth_tokens WHERE token_hash = ?', [hash]);
  return { userId: rows[0].user_id, newEmail: rows[0].new_email };
}
