// Checks the running server end to end: health, CSRF protection, wrong and right passwords,
// the session cookie, and sign-out. Start the server first (npm run dev), then run:
//   node server/src/cli/smoke-login.js
import readline from 'node:readline';
import { Writable } from 'node:stream';

const BASE = (process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
const jar = new Map();

function prompt(question, { hidden = false } = {}) {
  let muted = false;
  const output = new Writable({ write(chunk, enc, cb) { if (!muted) process.stdout.write(chunk, enc); cb(); } });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
    muted = hidden;
  });
}

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
  if (body) headers['Content-Type'] = 'application/json';
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const response = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  remember(response);
  let json = null;
  try { json = await response.json(); } catch { /* no body */ }
  return { status: response.status, json };
}

let failures = 0;
function check(label, passed, detail = '') {
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${!passed && detail ? `  (${detail})` : ''}`);
}

async function main() {
  console.log(`Testing ${BASE}\n`);

  let r = await call('GET', '/health');
  check('Server is running', r.status === 200 && r.json?.data?.status === 'ok', `status ${r.status}`);

  r = await call('GET', '/ready');
  check('Server can reach the database', r.status === 200, `status ${r.status}`);

  r = await call('GET', '/auth/me');
  check('Not signed in: /auth/me is refused', r.status === 401, `status ${r.status}`);

  const email = process.env.SMOKE_EMAIL || (await prompt('Administrator email: ')).trim();
  const password = process.env.SMOKE_PASSWORD || (await prompt('Administrator password (hidden): ', { hidden: true }));
  const login = { email, password, area: 'admin' };

  r = await call('POST', '/auth/login', { body: login });
  check('Sign-in without a security token is blocked (CSRF)', r.status === 403 && r.json?.error?.code === 'csrf_failed', `status ${r.status}`);

  r = await call('GET', '/auth/csrf');
  const csrf = r.json?.data?.csrfToken;
  check('Security token issued', r.status === 200 && Boolean(csrf), `status ${r.status}`);

  r = await call('POST', '/auth/login', { body: { ...login, password: `${password}-wrong` }, csrf });
  check('A wrong password is refused', r.status === 401 && r.json?.error?.code === 'unauthenticated', `status ${r.status}`);

  r = await call('POST', '/auth/login', { body: login, csrf });
  const loggedIn = r.status === 200 && r.json?.data?.area === 'admin';
  check('Correct password signs in as administrator', loggedIn, `status ${r.status} ${r.json?.error?.message ?? ''}`);
  const csrf2 = r.json?.data?.csrfToken;
  check('Session cookie was set', jar.has('nb_session'));

  r = await call('GET', '/auth/me');
  check('/auth/me now shows the administrator', r.status === 200 && r.json?.data?.user?.roles?.includes('admin'), `status ${r.status}`);
  if (r.status === 200) console.log(`      signed in as: ${r.json.data.user.name} <${r.json.data.user.email}>`);

  r = await call('POST', '/auth/logout', { csrf: csrf2 });
  check('Sign-out works', r.status === 204, `status ${r.status}`);

  r = await call('GET', '/auth/me');
  check('After sign-out, /auth/me is refused again', r.status === 401, `status ${r.status}`);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed. Copy this whole output and send it to me.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nCould not finish: ${err.message}`);
  console.error('Is the server running (npm run dev) and is the address right?');
  process.exit(1);
});
