import test from 'node:test';
import assert from 'node:assert/strict';
import { CSRF_COOKIE, CSRF_HEADER, checkCsrf, createCsrfToken, isValidCsrfToken, originOf } from '../src/http/csrf.js';
import { clearCookie, parseCookies, serializeCookie } from '../src/http/cookies.js';

const secret = 'x'.repeat(40);
const appOrigin = 'https://naijabites.example';

function request(overrides = {}) {
  const token = createCsrfToken(secret);
  return {
    method: 'POST',
    headers: { origin: appOrigin, [CSRF_HEADER]: token },
    cookies: { [CSRF_COOKIE]: token },
    secret,
    appOrigin,
    ...overrides,
  };
}

test('CSRF tokens are signed', () => {
  const token = createCsrfToken(secret);
  assert.equal(isValidCsrfToken(token, secret), true);
  assert.equal(isValidCsrfToken(token, 'y'.repeat(40)), false);
  assert.equal(isValidCsrfToken(`${token}x`, secret), false);
  assert.equal(isValidCsrfToken('nodot', secret), false);
  assert.equal(isValidCsrfToken(undefined, secret), false);
});

test('safe methods never need a token', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.deepEqual(checkCsrf(request({ method, headers: {}, cookies: {} })), { ok: true });
  }
});

test('a normal same-site POST passes', () => {
  assert.deepEqual(checkCsrf(request()), { ok: true });
});

test('a POST from another site is refused', () => {
  const r = request();
  r.headers.origin = 'https://evil.example';
  assert.deepEqual(checkCsrf(r), { ok: false, reason: 'origin' });
});

test('a POST with no Origin and no Referer is refused; Referer is accepted as a fallback', () => {
  const r = request();
  delete r.headers.origin;
  assert.deepEqual(checkCsrf(r), { ok: false, reason: 'origin' });
  r.headers.referer = `${appOrigin}/checkout`;
  assert.deepEqual(checkCsrf(r), { ok: true });
  r.headers.origin = 'null';
  assert.deepEqual(checkCsrf(r), { ok: false, reason: 'origin' });
});

test('missing, mismatched or forged tokens are refused', () => {
  const missingHeader = request(); delete missingHeader.headers[CSRF_HEADER];
  assert.equal(checkCsrf(missingHeader).reason, 'token');
  const missingCookie = request(); missingCookie.cookies = {};
  assert.equal(checkCsrf(missingCookie).reason, 'token');
  const mismatch = request(); mismatch.headers[CSRF_HEADER] = createCsrfToken(secret);
  assert.equal(checkCsrf(mismatch).reason, 'token');
  const forged = request(); forged.headers[CSRF_HEADER] = 'abc.def'; forged.cookies[CSRF_COOKIE] = 'abc.def';
  assert.equal(checkCsrf(forged).reason, 'token');
});

test('originOf', () => {
  assert.equal(originOf('https://a.example/path?x=1'), 'https://a.example');
  assert.equal(originOf('not a url'), null);
});

test('cookies: parse', () => {
  const c = parseCookies('a=1; nb_session=abc%20def; b="q"; broken; =x; __proto__=bad');
  assert.equal(c.a, '1');
  assert.equal(c.nb_session, 'abc def');
  assert.equal(c.b, 'q');
  assert.equal(Object.getPrototypeOf(c), null);
  assert.deepEqual(Object.keys(parseCookies(undefined)), []);
  assert.equal(parseCookies('a=1; a=2').a, '1'); // first one wins
});

test('cookies: serialize', () => {
  assert.equal(
    serializeCookie('nb_session', 'tok', { httpOnly: true, secure: true, sameSite: 'Lax', maxAgeSeconds: 60 }),
    'nb_session=tok; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax',
  );
  assert.equal(serializeCookie('x', 'a b;c'), 'x=a%20b%3Bc; Path=/; SameSite=Lax');
  assert.match(clearCookie('nb_session', { httpOnly: true }), /Max-Age=0.*Expires=Thu, 01 Jan 1970/);
});
