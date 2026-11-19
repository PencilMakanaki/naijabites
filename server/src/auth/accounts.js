import { withTransaction } from '../db/pool.js';
import { AppError, conflict, notFound, validationFailed } from '../http/errors.js';
import { enqueueEmail } from '../mail/outbox.js';
import { hashPassword, verifyPassword } from '../security/passwords.js';
import { ulid } from '../security/ids.js';
import { consumeAuthToken, createAuthToken } from './authTokens.js';
import { summarizeUserAgent } from './userAgent.js';

const invalidLink = () => new AppError(400, 'invalid_token', 'This link is invalid or has expired. Please request a new one.');
const VERIFY_MINUTES = 24 * 60;
const RESET_MINUTES = 60;
const EMAIL_CHANGE_MINUTES = 60;

async function getUser(db, userId) {
  const [rows] = await db.execute(
    `SELECT id, public_id, full_name, email, phone, password_hash, email_verified_at, status
       FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

const revokeAllSessions = (db, userId) =>
  db.execute('UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL', [userId]);

export async function registerCustomer(pool, config, { name, email, phone, password }) {
  const passwordHash = await hashPassword(password);
  const publicId = ulid();
  const userId = await withTransaction(pool, async (connection) => {
    let id;
    try {
      const [result] = await connection.execute(
        `INSERT INTO users (public_id, full_name, email, phone, password_hash, password_changed_at)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
        [publicId, name, email, phone ?? null, passwordHash],
      );
      id = result.insertId;
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY') throw conflict('An account with this email already exists. Try signing in instead.', 'email_taken');
      throw err;
    }
    await connection.execute("INSERT INTO user_roles (user_id, role) VALUES (?, 'customer')", [id]);
    const token = await createAuthToken(connection, { userId: id, purpose: 'email_verify', ttlMinutes: VERIFY_MINUTES });
    await enqueueEmail(connection, { to: email, template: 'verify_email', data: { name, link: `${config.clientOrigin}/verify-email/${token}` } });
    return id;
  });
  return { userId, publicId };
}

export async function verifyEmail(pool, token) {
  await withTransaction(pool, async (connection) => {
    const used = await consumeAuthToken(connection, token, 'email_verify');
    if (!used) throw invalidLink();
    await connection.execute('UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(3)) WHERE id = ?', [used.userId]);
  });
}

export async function resendVerification(pool, config, user) {
  const current = await getUser(pool, user.id);
  if (!current || current.email_verified_at) return;
  await withTransaction(pool, async (connection) => {
    const token = await createAuthToken(connection, { userId: current.id, purpose: 'email_verify', ttlMinutes: VERIFY_MINUTES });
    await enqueueEmail(connection, { to: current.email, template: 'verify_email', data: { name: current.full_name, link:`${config.clientOrigin}/verify-email/${token}` } });
  });
}

/** Always looks the same from outside, whether or not the email is registered. */
export async function requestPasswordReset(pool, config, email) {
  const [rows] = await pool.execute("SELECT id, full_name FROM users WHERE email = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1", [email]);
  const user = rows[0];
  if (!user) return;
  await withTransaction(pool, async (connection) => {
    const token = await createAuthToken(connection, { userId: user.id, purpose: 'password_reset', ttlMinutes: RESET_MINUTES });
    await enqueueEmail(connection, { to: email, template: 'password_reset', data: { name: user.full_name, link: `${config.clientOrigin}/reset-password/${token}` } });
  });
}

export async function resetPassword(pool, { token, password }) {
  const passwordHash = await hashPassword(password);
  await withTransaction(pool, async (connection) => {
    const used = await consumeAuthToken(connection, token, 'password_reset');
    if (!used) throw invalidLink();
    const user = await getUser(connection, used.userId);
    if (!user || user.status !== 'active') throw invalidLink();
    await connection.execute(
      `UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3), failed_login_count = 0, locked_until = NULL,
              email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(3))
        WHERE id = ?`,
      [passwordHash, user.id],
    );
    await revokeAllSessions(connection, user.id);
    await enqueueEmail(connection, { to: user.email, template: 'password_changed', data: { name: user.full_name } });
  });
}

export async function changePassword(pool, { userId, currentSessionId, currentPassword, newPassword }) {
  const user = await getUser(pool, userId);
  if (!user) throw notFound();
  const check = await verifyPassword(currentPassword, user.password_hash);
  if (!check.valid) throw validationFailed({ currentPassword: 'Your current password is incorrect.' });
  const passwordHash = await hashPassword(newPassword);
  await withTransaction(pool, async (connection) => {
    await connection.execute('UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3) WHERE id = ?', [passwordHash, userId]);
    await connection.execute(
      'UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND id <> ? AND revoked_at IS NULL',
      [userId, currentSessionId],
    );
    await enqueueEmail(connection, { to: user.email, template: 'password_changed', data: { name: user.full_name } });
  });
}

export async function updateProfile(pool, userId, { name, phone }) {
  const sets = [];
  const values = [];
  if (name !== undefined) { sets.push('full_name = ?'); values.push(name); }
  if (phone !== undefined) { sets.push('phone = ?'); values.push(phone); }
  if (sets.length === 0) throw validationFailed({ _: 'Nothing to update.' });
  values.push(userId);
  await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values);
  const user = await getUser(pool, userId);
  return { name: user.full_name, email: user.email, phone: user.phone, emailVerified: user.email_verified_at !== null };
}

export async function requestEmailChange(pool, config, { userId, newEmail, password }) {
  const user = await getUser(pool, userId);
  if (!user) throw notFound();
  const check = await verifyPassword(password, user.password_hash);
  if (!check.valid) throw validationFailed({ password: 'Your password is incorrect.' });
  if (newEmail === user.email) throw validationFailed({ newEmail: 'That is already your email address.' });
  const [taken] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [newEmail]);
  if (taken.length) throw validationFailed({ newEmail: 'That email address is already in use.' });
  await withTransaction(pool, async (connection) => {
    const token = await createAuthToken(connection, { userId, purpose: 'email_change', ttlMinutes: EMAIL_CHANGE_MINUTES,newEmail });
    await enqueueEmail(connection, { to: newEmail, template: 'email_change', data: { name: user.full_name, newEmail, link: `${config.clientOrigin}/confirm-email/${token}` } });
  });
}

export async function confirmEmailChange(pool, token) {
  await withTransaction(pool, async (connection) => {
    const used = await consumeAuthToken(connection, token, 'email_change');
    if (!used || !used.newEmail) throw invalidLink();
    const user = await getUser(connection, used.userId);
    if (!user) throw invalidLink();
    try {
      await connection.execute('UPDATE users SET email = ?, email_verified_at = UTC_TIMESTAMP(3) WHERE id = ?', [used.newEmail, user.id]);
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY') throw conflict('That email address is already in use.', 'email_taken');
      throw err;
    }
    await enqueueEmail(connection, { to: user.email, template: 'email_changed_notice', data: { name: user.full_name, newEmail: used.newEmail } });
  });
}

// The id shown for a session is the first 16 characters of its stored hash: it names the session
// without being able to use it.
export async function listSessions(pool, userId, currentHash) {
  const [rows] = await pool.execute(
    `SELECT token_hash, area, ip, user_agent, created_at, last_seen_at FROM auth_sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(3)
      ORDER BY last_seen_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.token_hash.slice(0, 16),
    current: r.token_hash === currentHash,
    area: r.area,
    device: summarizeUserAgent(r.user_agent),
    ip: r.ip,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
  }));
}

export async function revokeOneSession(pool, userId, idPrefix, currentHash) {
  if (!/^[0-9a-f]{16}$/.test(idPrefix)) throw notFound();
  const [result] = await pool.execute(
    `UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP(3)
      WHERE user_id = ? AND token_hash LIKE ? AND token_hash <> ? AND revoked_at IS NULL`,
    [userId, `${idPrefix}%`, currentHash],
  );
  if (result.affectedRows === 0) throw notFound();
}

export async function revokeOtherSessions(pool, userId, currentHash) {
  await pool.execute(
    'UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND token_hash <> ? AND revoked_at IS NULL',
    [userId, currentHash],
  );
}