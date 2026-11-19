// A tiny in-memory stand-in for MySQL that understands exactly the statements the server uses.
// It lets the tests exercise the real routes, validation, sessions and tokens without a database.
// It checks logic, NOT real SQL syntax: that is checked by running the migrations and smoke tests.
export function createFakePool() {
  let db = { users: [], user_roles: [], auth_sessions: [], auth_tokens: [], email_outbox: [] };
  const seq = { users: 0, auth_sessions: 0, auth_tokens: 0, email_outbox: 0 };
  const unsupported = new Set();
  const now = () => new Date();
  const H = (o = {}) => [{ affectedRows: 0, insertId: 0, ...o }, undefined];
  const R = (r) => [r, undefined];
  const dup = () => Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY', errno: 1062 });
  const rolesOf = (id) => { const r = db.user_roles.filter((x) => x.user_id === id).map((x) => x.role); return r.length ? r.join(',') : null; };
  const userById = (id) => db.users.find((u) => u.id === id && !u.deleted_at);
  const upd = (rows, fn) => { rows.forEach(fn); return H({ affectedRows: rows.length }); };

  function exec(sqlRaw, p = []) {
    const sql = sqlRaw.replace(/\s+/g, ' ').trim();
    if (p.some((v) => v === undefined)) throw new Error(`FakeDb: undefined parameter in: ${sql.slice(0, 90)}`);

    if (sql === 'SELECT 1') return R([{ 1: 1 }]);

    // ---- sessions
    if (sql.startsWith('INSERT INTO auth_sessions')) {
      const row = { id: ++seq.auth_sessions, user_id: p[0], token_hash: p[1], area: p[2], ip: p[3], user_agent: p[4], expires_at: p[5], last_seen_at: now(), revoked_at: null, created_at: now() };
      db.auth_sessions.push(row); return H({ insertId: row.id, affectedRows: 1 });
    }
    if (sql.startsWith('SELECT s.id AS session_id')) {
      const s = db.auth_sessions.find((x) => x.token_hash === p[0] && !x.revoked_at && x.expires_at > now());
      const u = s && userById(s.user_id);
      if (!s || !u || u.status !== 'active') return R([]);
      return R([{ session_id: s.id, token_hash: s.token_hash, area: s.area, last_seen_at: s.last_seen_at, user_id: u.id, public_id: u.public_id, full_name: u.full_name, email: u.email, phone: u.phone, email_verified_at: u.email_verified_at, roles: rolesOf(u.id) }]);
    }
    if (sql.startsWith('UPDATE auth_sessions SET last_seen_at')) return upd(db.auth_sessions.filter((x) => x.id === p[1]), (x) => { x.last_seen_at = now(); x.expires_at = p[0]; });
    if (sql.startsWith('UPDATE auth_sessions SET revoked_at')) {
      let rows;
      if (sql.includes('WHERE token_hash = ? AND revoked_at IS NULL')) rows = db.auth_sessions.filter((x) => x.token_hash === p[0] && !x.revoked_at);
      else if (sql.includes('user_id = ? AND id <> ? AND revoked_at IS NULL')) rows = db.auth_sessions.filter((x) => x.user_id === p[0] && x.id !== p[1] && !x.revoked_at);
      else if (sql.includes('token_hash LIKE ? AND token_hash <> ?')) rows = db.auth_sessions.filter((x) => x.user_id === p[0] && x.token_hash.startsWith(p[1].replace('%', '')) && x.token_hash !== p[2] && !x.revoked_at);
      else if (sql.includes('user_id = ? AND token_hash <> ? AND revoked_at IS NULL')) rows = db.auth_sessions.filter((x) => x.user_id === p[0] && x.token_hash !== p[1] && !x.revoked_at);
      else if (sql.includes('WHERE user_id = ? AND revoked_at IS NULL')) rows = db.auth_sessions.filter((x) => x.user_id === p[0] && !x.revoked_at);
      else throw new Error(`FakeDb: unsupported revoke: ${sql}`);
      return upd(rows, (x) => { x.revoked_at = now(); });
    }
    if (sql.startsWith('SELECT token_hash, area, ip, user_agent, created_at, last_seen_at FROM auth_sessions')) {
      return R(db.auth_sessions.filter((x) => x.user_id === p[0] && !x.revoked_at && x.expires_at > now()).sort((a, b) => b.last_seen_at - a.last_seen_at));
    }

    // ---- users
    if (sql.startsWith('SELECT u.id, u.public_id, u.full_name, u.email, u.phone, u.password_hash')) {
      const u = db.users.find((x) => x.email.toLowerCase() === String(p[0]).toLowerCase());
      return R(u ? [{ ...u, roles: rolesOf(u.id) }] : []);
    }
    if (sql.startsWith('UPDATE users SET failed_login_count = ?, locked_until = ?')) return upd(db.users.filter((u) => u.id === p[2]), (u) => { u.failed_login_count = p[0]; u.locked_until = p[1]; });
    if (sql.startsWith('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at')) return upd(db.users.filter((u) => u.id === p[0]), (u) => { u.failed_login_count = 0; u.locked_until = null; u.last_login_at = now(); });
    if (sql === 'UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3) WHERE id = ?') return upd(db.users.filter((u) => u.id === p[1]), (u) => { u.password_hash = p[0]; u.password_changed_at = now(); });
    if (sql.startsWith('UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3), failed_login_count = 0')) return upd(db.users.filter((u) => u.id === p[1]), (u) => { u.password_hash = p[0]; u.failed_login_count = 0; u.locked_until = null; u.email_verified_at ??= now(); });
    if (sql.startsWith('INSERT INTO users')) {
      if (db.users.some((u) => u.email.toLowerCase() === String(p[2]).toLowerCase())) throw dup();
      const u = { id: ++seq.users, public_id: p[0], full_name: p[1], email: p[2], phone: p[3], password_hash: p[4], email_verified_at: null, failed_login_count: 0, locked_until: null, status: 'active', deleted_at: null, last_login_at: null };
      db.users.push(u); return H({ insertId: u.id, affectedRows: 1 });
    }
    if (sql.startsWith('INSERT INTO user_roles')) { db.user_roles.push({ user_id: p[0], role: 'customer' }); return H({ affectedRows: 1 }); }
    if (sql.startsWith('SELECT id, public_id, full_name, email, phone, password_hash, email_verified_at, status FROM users')) { const u = userById(p[0]); return R(u ? [u] : []); }
    if (sql.startsWith('UPDATE users SET email_verified_at = COALESCE')) return upd(db.users.filter((u) => u.id === p[0]), (u) => { u.email_verified_at ??= now(); });
    if (sql.startsWith('SELECT id, full_name FROM users WHERE email = ?')) { const u = db.users.find((x) => x.email.toLowerCase() === p[0].toLowerCase() && x.status === 'active' && !x.deleted_at); return R(u ? [u] : []); }
    if (sql.startsWith('SELECT id FROM users WHERE email = ?')) { const u = db.users.find((x) => x.email.toLowerCase() === p[0].toLowerCase()); return R(u ? [{ id: u.id }] : []); }
    if (sql.startsWith('UPDATE users SET email = ?, email_verified_at')) {
      if (db.users.some((u) => u.email.toLowerCase() === p[0].toLowerCase() && u.id !== p[1])) throw dup();
      return upd(db.users.filter((u) => u.id === p[1]), (u) => { u.email = p[0]; u.email_verified_at = now(); });
    }
    let m = /^UPDATE users SET (.+) WHERE id = \?$/.exec(sql);
    if (m && /^(full_name = \?|phone = \?)(, phone = \?)?$/.test(m[1])) {
      const cols = m[1].split(', ').map((c) => c.replace(' = ?', ''));
      return upd(db.users.filter((u) => u.id === p[cols.length]), (u) => cols.forEach((c, i) => { u[c] = p[i]; }));
    }

    // ---- one-time tokens
    if (sql.startsWith('UPDATE auth_tokens SET used_at = UTC_TIMESTAMP(3) WHERE user_id = ?')) return upd(db.auth_tokens.filter((t) => t.user_id === p[0] && t.purpose === p[1] && !t.used_at), (t) => { t.used_at = now(); });
    if (sql.startsWith('INSERT INTO auth_tokens')) { db.auth_tokens.push({ id: ++seq.auth_tokens, user_id: p[0], purpose: p[1], token_hash: p[2], new_email: p[3], expires_at: p[4], used_at: null }); return H({ affectedRows: 1 }); }
    if (sql.startsWith('UPDATE auth_tokens SET used_at = UTC_TIMESTAMP(3) WHERE token_hash = ?')) return upd(db.auth_tokens.filter((t) => t.token_hash === p[0] && t.purpose === p[1] && !t.used_at && t.expires_at > now()), (t) => { t.used_at = now(); });
    if (sql.startsWith('SELECT user_id, new_email FROM auth_tokens')) return R(db.auth_tokens.filter((t) => t.token_hash === p[0]));

    // ---- email queue
    if (sql.startsWith('INSERT INTO email_outbox')) { db.email_outbox.push({ id: ++seq.email_outbox, to_email: p[0], template: p[1], payload: JSON.parse(p[2]), status: 'queued', attempts: 0 }); return H({ affectedRows: 1 }); }
    if (sql.startsWith('SELECT payload FROM email_outbox')) { const r = db.email_outbox.filter((e) => e.to_email === p[0] && e.template === p[1]).sort((a, b) => b.id - a.id)[0]; return R(r ? [{ payload: r.payload }] : []); }
    if (sql.startsWith('SELECT id, to_email, template, payload, attempts FROM email_outbox')) { const r = db.email_outbox.find((e) => e.status === 'queued'); return R(r ? [r] : []); }
    if (sql.startsWith("UPDATE email_outbox SET status = 'sending'")) return upd(db.email_outbox.filter((e) => e.id === p[0]), (e) => { e.status = 'sending'; });
    if (sql.startsWith("UPDATE email_outbox SET status = 'sent'")) return upd(db.email_outbox.filter((e) => e.id === p[0]), (e) => { e.status = 'sent'; });
    if (sql.startsWith("UPDATE email_outbox SET status = 'queued' WHERE status = 'sending'")) return upd(db.email_outbox.filter((e) => e.status === 'sending'), (e) => { e.status = 'queued'; });

    unsupported.add(sql.slice(0, 120));
    throw new Error(`FakeDb: unsupported SQL: ${sql.slice(0, 140)}`);
  }

  const makeConn = () => {
    let snapshot = null;
    return {
      execute: async (s, p) => exec(s, p), query: async (s, p) => exec(s, p),
      beginTransaction: async () => { snapshot = structuredClone(db); },
      commit: async () => { snapshot = null; },
      rollback: async () => { if (snapshot) db = snapshot; snapshot = null; },
      release: () => {},
    };
  };
  const pool = { ...makeConn(), getConnection: async () => makeConn(), end: async () => {}, _unsupported: unsupported, _db: () => db };
  return pool;
}
