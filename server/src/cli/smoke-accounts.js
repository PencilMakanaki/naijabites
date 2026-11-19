// Tests every account flow end to end against the running server and database:
// sign-up, email confirmation, profile, password change, forgot and reset password,
// and email change. It creates one throw-away test account (smoke.<number>@example.test).
// Start the server first (npm run dev), then run:  npm run smoke:accounts
// The server's request limits are counted in memory, so restart the server if you run this
// more than twice in an hour.
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';

const config = loadConfig();
const BASE = config.appOrigin;
const pool = createPool(config, { connectionLimit: 2 });
const jar = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function remember(response) {
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(';')[0];
    const index = pair.indexOf('=');
    const name = pair.slice(0, index).trim();
    if (/;\s*Max-Age=0/i.test(line)) jar.delete(name);
    else jar.set(name, pair.slice(index + 1));
  }
}

async function call(method, path, { body, csrf } = {}) {
  const headers = { Origin: BASE };
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const response = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  remember(response);
  let json = null;
  try { json = await response.json(); } catch { /* no body */ }
  return { status: response.status, json, data: json?.data, error: json?.error };
}

let failures = 0;
function check(label, passed, detail = '') {
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${!passed && detail ? `  (${detail})` : ''}`);
}

async function linkFor(email, template) {
  for (let i = 0; i < 12; i += 1) {
    const [rows] = await pool.execute('SELECT payload FROM email_outbox WHERE to_email = ? AND template = ? ORDER BY id DESC LIMIT 1', [email, template]);
    if (rows.length) {
      const payload = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
      if (payload.link) return payload.link;
    }
    await sleep(500);
  }
  return null;
}
const tokenOf = (link) => (link ? link.split('/').pop() : '');

async function main() {
  const stamp = Date.now();
  const email = `smoke.${stamp}@example.test`;
  const email2 = `smoke.${stamp}.b@example.test`;
  const P1 = 'Smoke-Test-1!';
  const P2 = 'Smoke-Test-2!';
  const P3 = 'Smoke-Test-3!';
  console.log(`Testing ${BASE}\nTest account: ${email}\n`);

  let r = await call('GET', '/health');
  check('Server is running', r.status === 200, `status ${r.status}`);
  r = await call('GET', '/auth/csrf');
  let csrf = r.data?.csrfToken;
  check('Security token issued', Boolean(csrf));

  r = await call('POST', '/auth/register', { csrf, body: { name: 'Smoke Tester', email, phone: '0803 123 4567', password: P1 } });
  check('Sign-up works and signs you in', r.status === 201 && r.data?.user?.emailVerified === false, `status ${r.status} ${r.error?.message ?? ''}`);
  check('Phone number is stored in +234 form', r.data?.user?.phone === '+2348031234567', String(r.data?.user?.phone));
  csrf = r.data?.csrfToken ?? csrf;

  r = await call('POST', '/auth/register', { csrf, body: { name: 'Smoke Again', email, password: P1 } });
  check('Signing up with the same email is refused', r.status === 409 && r.error?.code === 'email_taken', `status ${r.status}`);

  r = await call('GET', '/auth/me');
  check('/auth/me shows the new account, email not yet confirmed', r.status === 200 && r.data?.user?.emailVerified === false, `status ${r.status}`);

  const verifyLink = await linkFor(email, 'verify_email');
  check('A confirmation email was queued', Boolean(verifyLink));
  r = await call('POST', '/auth/verify-email', { csrf, body: { token: tokenOf(verifyLink) } });
  check('The confirmation link works', r.status === 200, `status ${r.status} ${r.error?.message ?? ''}`);
  r = await call('POST', '/auth/verify-email', { csrf, body: { token: tokenOf(verifyLink) } });
  check('The same link cannot be used twice', r.status === 400 && r.error?.code === 'invalid_token', `status ${r.status}`);
  r = await call('GET', '/auth/me');
  check('Email now shows as confirmed', r.data?.user?.emailVerified === true);

  r = await call('PATCH', '/me/profile', { csrf, body: { name: 'Smoke Tester Two', phone: '' } });
  check('Profile update works (name changed, phone removed)', r.status === 200 && r.data?.user?.name === 'Smoke Tester Two' && r.data?.user?.phone === null, `status ${r.status} ${JSON.stringify(r.error ?? '')}`);

  r = await call('POST', '/auth/change-password', { csrf, body: { currentPassword: 'Wrong-Pass-9!', newPassword: P2 } });
  check('Changing password with a wrong current password is refused', r.status === 422 && Boolean(r.error?.fields?.currentPassword), `status ${r.status}`);
  r = await call('POST', '/auth/change-password', { csrf, body: { currentPassword: P1, newPassword: P2 } });
  check('Changing password works', r.status === 200, `status ${r.status} ${r.error?.message ?? ''}`);

  r = await call('GET', '/me/sessions');
  check('Devices list shows this device', r.status === 200 && r.data?.length === 1 && r.data[0].current === true, `status ${r.status}`);

  await call('POST', '/auth/logout', { csrf });
  r = await call('POST', '/auth/login', { csrf, body: { email, password: P1 } });
  check('The old password no longer works', r.status === 401, `status ${r.status}`);
  r = await call('POST', '/auth/login', { csrf, body: { email, password: P2 } });
  check('The new password works', r.status === 200, `status ${r.status} ${r.error?.message ?? ''}`);
  csrf = r.data?.csrfToken ?? csrf;

  r = await call('POST', '/auth/forgot-password', { csrf, body: { email: `nobody.${stamp}@example.test` } });
  const unknownStatus = r.status;
  r = await call('POST', '/auth/forgot-password', { csrf, body: { email } });
  check('Forgot-password answers the same for unknown and real emails', unknownStatus === 202 && r.status === 202, `${unknownStatus} / ${r.status}`);
  const resetLink = await linkFor(email, 'password_reset');
  check('A reset email was queued', Boolean(resetLink));
  r = await call('POST', '/auth/reset-password', { csrf, body: { token: tokenOf(resetLink), password: P3 } });
  check('Reset link sets a new password', r.status === 200, `status ${r.status} ${r.error?.message ?? ''}`);
  r = await call('GET', '/auth/me');
  check('Everyone is signed out after a reset', r.status === 401, `status ${r.status}`);
  r = await call('POST', '/auth/login', { csrf, body: { email, password: P2 } });
  check('The password from before the reset no longer works', r.status === 401, `status ${r.status}`);
  r = await call('POST', '/auth/login', { csrf, body: { email, password: P3 } });
  check('Signing in with the reset password works', r.status === 200, `status ${r.status}`);
  csrf = r.data?.csrfToken ?? csrf;

  r = await call('POST', '/me/email-change', { csrf, body: { newEmail: email2, password: P3 } });
  check('Starting an email change works', r.status === 202, `status ${r.status} ${JSON.stringify(r.error ?? '')}`);
  const changeLink = await linkFor(email2, 'email_change');
  check('A confirmation email for the new address was queued', Boolean(changeLink));
  r = await call('POST', '/auth/confirm-email-change', { csrf, body: { token: tokenOf(changeLink) } });
  check('The new address is confirmed', r.status === 200, `status ${r.status} ${r.error?.message ?? ''}`);
  await call('POST', '/auth/logout', { csrf });
  r = await call('POST', '/auth/login', { csrf, body: { email, password: P3 } });
  check('The old email no longer signs in', r.status === 401, `status ${r.status}`);
  r = await call('POST', '/auth/login', { csrf, body: { email: email2, password: P3 } });
  check('The new email signs in', r.status === 200, `status ${r.status}`);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed. Copy this whole output and send it to me.`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(`\nCould not finish: ${err.message}`);
  console.error('Is the server running (npm run dev), and is the database up?');
  await pool.end().catch(() => {});
  process.exit(1);
});
