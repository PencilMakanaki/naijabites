// Runs the real server (routes, validation, CSRF, sessions, rate limits, email queue) against an
// in-memory stand-in for the database, and checks the account flows end to end.
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { startMailWorker } from '../src/mail/outbox.js';
import { hashPassword } from '../src/security/passwords.js';
import { createFakePool } from './helpers/fakeDb.js';

let server; let base; let pool; let worker; const sent = [];

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer().listen(0, () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

class Client {
  constructor() { this.jar = new Map(); this.csrf = null; }
  async call(method, path, { body, raw, headers: extra } = {}) {
    const headers = { Origin: base, ...extra };
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
    if (this.csrf && !headers['X-CSRF-Token'] && headers['X-CSRF-Token'] !== null) headers['X-CSRF-Token'] = this.csrf;
    if (headers['X-CSRF-Token'] === null) delete headers['X-CSRF-Token'];
    const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';')[0]; const i = pair.indexOf('='); const name = pair.slice(0, i).trim();
      if (/;\s*Max-Age=0/i.test(line)) this.jar.delete(name); else this.jar.set(name, pair.slice(i + 1));
    }
    let json = null; try { json = await response.json(); } catch { /* no body */ }
    if (json?.data?.csrfToken) this.csrf = json.data.csrfToken;
    return { status: response.status, json, data: json?.data, error: json?.error, headers: response.headers };
  }
  async start() { const r = await this.call('GET', '/auth/csrf'); this.csrf = r.data.csrfToken; return this; }
}
const linkFor = (email, template) => pool._db().email_outbox.filter((e) => e.to_email === email && e.template === template).at(-1)?.payload?.link;
const tokenOf = (link) => link.split('/').pop();
const waitForMail = async (count) => { for (let i = 0; i < 40 && sent.length < count; i += 1) await new Promise((r) => setTimeout(r, 50)); };

// Every test gets its own server, database and request counters, so tests cannot affect each other.
beforeEach(async () => {
  sent.length = 0;
  const port = await freePort();
  base = `http://localhost:${port}`;
  const config = loadConfig({
    NODE_ENV: 'test', PORT: String(port), APP_ORIGIN: base, DB_NAME: 'x', DB_USER: 'x', DB_PASSWORD: 'x',
    CSRF_SECRET: 'unit-test-secret-unit-test-secret-1234', LOG_LEVEL: 'silent',
  });
  pool = createFakePool();
  const logger = createLogger(config);
  worker = startMailWorker({ pool, mailer: { kind: 'test', send: async (m) => { sent.push(m); } }, logger, config, intervalMs: 50 });
  server = createApp({ config, logger, pool, clientDir: null }).listen(port);
  await new Promise((resolve) => server.once('listening', resolve));
});
afterEach(async () => { worker.stop(); await new Promise((resolve) => server.close(resolve)); });

test('health and unknown paths', async () => {
  const c = await new Client().start();
  assert.equal((await c.call('GET', '/health')).data.status, 'ok');
  assert.equal((await c.call('GET', '/ready')).data.status, 'ready');
  const missing = await c.call('GET', '/nope');
  assert.equal(missing.status, 404); assert.equal(missing.error.code, 'not_found');
  assert.ok(missing.error.requestId);
});

test('security headers are present', async () => {
  const r = await new Client().call('GET', '/health');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('CSRF: changes without a token or from another site are refused', async () => {
  const c = await new Client().start();
  const body = { name: 'Ada Okafor', email: 'csrf@example.test', password: 'Naija-Bites-26!' };
  assert.equal((await c.call('POST', '/auth/register', { body, headers: { 'X-CSRF-Token': null } })).error.code, 'csrf_failed');
  assert.equal((await c.call('POST', '/auth/register', { body, headers: { Origin: 'https://evil.example' } })).error.code, 'csrf_failed');
  assert.equal((await c.call('POST', '/auth/register', { body, headers: { 'X-CSRF-Token': 'abc.def' } })).error.code, 'csrf_failed');
});

test('bad requests get clean errors', async () => {
  const c = await new Client().start();
  const bad = await c.call('POST', '/auth/login', { raw: '{not json', headers: { 'Content-Type': 'application/json' } });
  assert.equal(bad.status, 400);
  const big = await c.call('POST', '/auth/login', { raw: JSON.stringify({ x: 'a'.repeat(200_000) }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(big.status, 413);
  const extra = await c.call('POST', '/auth/login', { body: { email: 'a@b.co', password: 'x', admin: true } });
  assert.equal(extra.status, 422); // unknown fields are rejected
});

test('sign-up validates every field and reports them separately', async () => {
  const c = await new Client().start();
  const r = await c.call('POST', '/auth/register', { body: { name: 'A', email: 'nope', phone: 'abc', password: 'weak' } });
  assert.equal(r.status, 422);
  assert.deepEqual(Object.keys(r.error.fields).sort(), ['email', 'name', 'password', 'phone']);
});

test('full account journey: sign-up, confirm, profile, passwords, reset, email change', async () => {
  const c = await new Client().start();
  const email = 'journey@example.test';
  let r = await c.call('POST', '/auth/register', { body: { name: 'Ada Okafor', email, phone: '0803 123 4567', password: 'Naija-Bites-26!' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.phone, '+2348031234567');
  assert.equal(r.data.user.emailVerified, false);
  assert.ok(c.jar.has('nb_session'));

  r = await c.call('POST', '/auth/register', { body: { name: 'Ada Again', email: email.toUpperCase(), password: 'Naija-Bites-26!' } });
  assert.equal(r.status, 409); assert.equal(r.error.code, 'email_taken');

  const verify = linkFor(email, 'verify_email'); assert.ok(verify);
  r = await c.call('POST', '/auth/verify-email', { body: { token: tokenOf(verify) } }); assert.equal(r.status, 200);
  r = await c.call('POST', '/auth/verify-email', { body: { token: tokenOf(verify) } }); assert.equal(r.error.code, 'invalid_token');
  assert.equal((await c.call('GET', '/auth/me')).data.user.emailVerified, true);

  r = await c.call('PATCH', '/me/profile', { body: { name: 'Ada Okafor-Bello', phone: '' } });
  assert.equal(r.data.user.name, 'Ada Okafor-Bello'); assert.equal(r.data.user.phone, null);
  assert.equal((await c.call('PATCH', '/me/profile', { body: {} })).status, 422);

  r = await c.call('POST', '/auth/change-password', { body: { currentPassword: 'Wrong-Pass-9!', newPassword: 'Naija-Bites-27!' } });
  assert.equal(r.status, 422); assert.ok(r.error.fields.currentPassword);
  assert.equal((await c.call('POST', '/auth/change-password', { body: { currentPassword: 'Naija-Bites-26!', newPassword: 'weak' } })).status, 422);
  assert.equal((await c.call('POST', '/auth/change-password', { body: { currentPassword: 'Naija-Bites-26!', newPassword: 'Naija-Bites-27!' } })).status, 200);

  // a second device is signed out when the password changes elsewhere
  const other = await new Client().start();
  assert.equal((await other.call('POST', '/auth/login', { body: { email, password: 'Naija-Bites-27!' } })).status, 200);
  assert.equal((await c.call('GET', '/me/sessions')).data.length, 2);
  assert.equal((await c.call('POST', '/auth/change-password', { body: { currentPassword: 'Naija-Bites-27!', newPassword: 'Naija-Bites-28!' } })).status, 200);
  assert.equal((await other.call('GET', '/auth/me')).status, 401);
  assert.equal((await c.call('GET', '/auth/me')).status, 200);

  // forgot and reset
  const unknown = await c.call('POST', '/auth/forgot-password', { body: { email: 'nobody@example.test' } });
  const known = await c.call('POST', '/auth/forgot-password', { body: { email } });
  assert.equal(unknown.status, 202); assert.equal(known.status, 202);
  assert.deepEqual(unknown.data, known.data);
  assert.equal(linkFor('nobody@example.test', 'password_reset'), undefined);
  const reset = linkFor(email, 'password_reset');
  assert.equal((await c.call('POST', '/auth/reset-password', { body: { token: tokenOf(reset), password: 'weak' } })).status, 422);
  assert.equal((await c.call('POST', '/auth/reset-password', { body: { token: tokenOf(reset), password: 'Naija-Bites-29!' } })).status, 200);
  assert.equal((await c.call('POST', '/auth/reset-password', { body: { token: tokenOf(reset), password: 'Naija-Bites-30!' } })).error.code, 'invalid_token');
  assert.equal((await c.call('GET', '/auth/me')).status, 401);
  assert.equal((await c.call('POST', '/auth/login', { body: { email, password: 'Naija-Bites-28!' } })).status, 401);
  assert.equal((await c.call('POST', '/auth/login', { body: { email, password: 'Naija-Bites-29!' } })).status, 200);

  // email change
  assert.equal((await c.call('POST', '/me/email-change', { body: { newEmail: 'journey2@example.test', password: 'Wrong-Pass-9!' } })).status, 422);
  assert.equal((await c.call('POST', '/me/email-change', { body: { newEmail: 'journey2@example.test', password: 'Naija-Bites-29!' } })).status, 202);
  const change = linkFor('journey2@example.test', 'email_change');
  assert.equal((await c.call('POST', '/auth/confirm-email-change', { body: { token: tokenOf(change) } })).status, 200);
  await c.call('POST', '/auth/logout');
  assert.equal((await c.call('GET', '/auth/me')).status, 401);
  assert.equal((await c.call('POST', '/auth/login', { body: { email, password: 'Naija-Bites-29!' } })).status, 401);
  assert.equal((await c.call('POST', '/auth/login', { body: { email: 'journey2@example.test', password: 'Naija-Bites-29!' } })).status, 200);

  // the queued emails really went out through the worker
  await waitForMail(7);
  const subjects = sent.map((m) => m.subject);
  assert.ok(subjects.includes('Confirm your email address'));
  assert.ok(subjects.includes('Reset your NaijaBites password'));
  assert.ok(subjects.includes('Confirm your new email address'));
});

test('sessions can be listed and signed out one by one', async () => {
  const email = 'devices@example.test';
  const a = await new Client().start();
  await a.call('POST', '/auth/register', { body: { name: 'Dev Ices', email, password: 'Naija-Bites-26!' } });
  const b = await new Client().start();
  await b.call('POST', '/auth/login', { body: { email, password: 'Naija-Bites-26!' } });
  const list = (await a.call('GET', '/me/sessions')).data;
  assert.equal(list.length, 2);
  const mine = list.find((s) => s.current); const theirs = list.find((s) => !s.current);
  assert.equal((await a.call('DELETE', `/me/sessions/${mine.id}`)).status, 404); // sign out normally instead
  assert.equal((await a.call('DELETE', '/me/sessions/not-an-id')).status, 404);
  assert.equal((await a.call('DELETE', `/me/sessions/${theirs.id}`)).status, 204);
  assert.equal((await b.call('GET', '/auth/me')).status, 401);
  assert.equal((await a.call('GET', '/auth/me')).status, 200);
});

test('someone else cannot use your devices list or profile without signing in', async () => {
  const c = await new Client().start();
  assert.equal((await c.call('GET', '/me/sessions')).status, 401);
  assert.equal((await c.call('PATCH', '/me/profile', { body: { name: 'Hacker' } })).status, 401);
  assert.equal((await c.call('POST', '/auth/change-password', { body: { currentPassword: 'x', newPassword: 'Naija-Bites-26!' } })).status, 401);
});

test('sign-in: roles, wrong passwords and the 5-attempt lock', async () => {
  const email = 'lock@example.test';
  const owner = await new Client().start();
  await owner.call('POST', '/auth/register', { body: { name: 'Lock Test', email, password: 'Naija-Bites-26!' } });

  const c = await new Client().start();
  const staff = await c.call('POST', '/auth/login', { body: { email, password: 'Naija-Bites-26!', area: 'admin' } });
  assert.equal(staff.status, 403); // right password, but a customer cannot use the staff door

  for (let i = 0; i < 5; i += 1) {
    const r = await c.call('POST', '/auth/login', { body: { email, password: 'Wrong-Pass-9!' } });
    assert.equal(r.status, 401);
    assert.match(r.error.message, /Email or password is incorrect/);
  }
  const locked = await c.call('POST', '/auth/login', { body: { email, password: 'Naija-Bites-26!' } });
  assert.equal(locked.status, 401); // locked: even the right password is refused for now
  const unknown = await c.call('POST', '/auth/login', { body: { email: 'ghost@example.test', password: 'Naija-Bites-26!' } });
  assert.equal(unknown.error.message, locked.error.message); // unknown and locked look identical
});

test('old-app passwords still work and are upgraded on first sign-in', async () => {
  const { randomBytes, scrypt } = await import('node:crypto');
  const salt = randomBytes(16).toString('hex');
  const key = await new Promise((res, rej) => scrypt('Old-Pass-1!', salt, 64, (e, k) => (e ? rej(e) : res(k))));
  await pool.execute('INSERT INTO users (public_id, full_name, email, phone, password_hash, password_changed_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))', ['01LEGACY0000000000000000000', 'Old Account', 'legacy@example.test', null, `${salt}:${key.toString('hex')}`]);
  const id = pool._db().users.at(-1).id; pool._db().user_roles.push({ user_id: id, role: 'customer' });
  const c = await new Client().start();
  assert.equal((await c.call('POST', '/auth/login', { body: { email: 'legacy@example.test', password: 'Old-Pass-1!' } })).status, 200);
  assert.match(pool._db().users.at(-1).password_hash, /^scrypt\$32768\$8\$3\$/);
  await c.call('POST', '/auth/logout');
  assert.equal((await c.call('POST', '/auth/login', { body: { email: 'legacy@example.test', password: 'Old-Pass-1!' } })).status, 200);
});

test('staff sessions use area-based access', async () => {
  const hash = await hashPassword('Admin-Pass-1!');
  await pool.execute('INSERT INTO users (public_id, full_name, email, phone, password_hash, password_changed_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))', ['01ADMIN0000000000000000000', 'Admin Person', 'admin@example.test', null, hash]);
  pool._db().user_roles.push({ user_id: pool._db().users.at(-1).id, role: 'admin' });
  const c = await new Client().start();
  assert.equal((await c.call('POST', '/auth/login', { body: { email: 'admin@example.test', password: 'Admin-Pass-1!' } })).status, 403); // customer door
  const r = await c.call('POST', '/auth/login', { body: { email: 'admin@example.test', password: 'Admin-Pass-1!', area: 'admin' } });
  assert.equal(r.status, 200); assert.equal(r.data.area, 'admin');
  assert.match(c.jar.get('nb_session') ? 'set' : 'missing', /set/);
});

test('request limits: sign-up is limited per connection', async () => {
  const c = await new Client().start();
  let last;
  for (let i = 0; i < 6; i += 1) last = await c.call('POST', '/auth/register', { body: { name: 'Limit Test', email: `limit${i}@example.test`, password: 'Naija-Bites-26!' } });
  assert.equal(last.status, 429);
  assert.equal(last.error.code, 'rate_limited');
});
