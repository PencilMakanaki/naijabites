import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scrypt } from 'node:crypto';
import { burnPasswordCheck, hashPassword, verifyPassword, CURRENT } from '../src/security/passwords.js';

// Re-creates exactly what the old NaijaBites server.js stored, so existing accounts keep working.
function legacyHash(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString('hex');
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(`${salt}:${key.toString('hex')}`)));
  });
}

test('new hashes verify and do not need replacing', async () => {
  const stored = await hashPassword('Correct-Horse-9');
  assert.match(stored, /^scrypt\$32768\$8\$3\$[\w-]+\$[\w-]+$/);
  assert.deepEqual(await verifyPassword('Correct-Horse-9', stored), { valid: true, needsRehash: false });
  assert.deepEqual(await verifyPassword('Wrong-Horse-9', stored), { valid: false, needsRehash: false });
});

test('two hashes of the same password differ (random salt)', async () => {
  assert.notEqual(await hashPassword('Same-Pass-1!'), await hashPassword('Same-Pass-1!'));
});

test('old-app hashes still verify and are flagged for replacement', async () => {
  const stored = await legacyHash('Old-Pass-1!');
  assert.deepEqual(await verifyPassword('Old-Pass-1!', stored), { valid: true, needsRehash: true });
  assert.deepEqual(await verifyPassword('Old-Pass-2!', stored), { valid: false, needsRehash: false });
});

test('weaker settings are flagged for replacement', async () => {
  const salt = randomBytes(16);
  const key = await new Promise((res, rej) => scrypt('Weak-Params-1!', salt, CURRENT.keyLength, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
  const stored = ['scrypt', 16384, 8, 1, salt.toString('base64url'), key.toString('base64url')].join('$');
  assert.deepEqual(await verifyPassword('Weak-Params-1!', stored), { valid: true, needsRehash: true });
});

test('malformed or hostile stored values never throw and never validate', async () => {
  const bad = [undefined, null, '', 'plain-text', ':', 'abc:', ':abc', 'abc:not-hex', 'scrypt$', 'scrypt$1$1$1$a$b',
    'scrypt$99999999$8$3$c2FsdA$aGFzaA', 'scrypt$32768$8$99$c2FsdA$aGFzaA', 'scrypt$32768$8$3$$'];
  for (const stored of bad) {
    assert.deepEqual(await verifyPassword('anything', stored), { valid: false, needsRehash: false }, `stored=${String(stored)}`);
  }
});

test('burnPasswordCheck finishes without error', async () => {
  await burnPasswordCheck('whatever');
});
