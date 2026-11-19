import test from 'node:test';
import assert from 'node:assert/strict';
import { hasErrors, validateEmailOnly, validateNewPassword, validateProfile, validateRegister } from './forms.js';

const good = { name: 'Ada Okafor', email: 'ada@example.com', phone: '0803 123 4567', password: 'Naija-Bites-26!', confirm: 'Naija-Bites-26!' };

test('a correct sign-up form has no errors', () => {
  assert.deepEqual(validateRegister(good), {});
  assert.deepEqual(validateRegister({ ...good, phone: '' }), {});
});

test('each sign-up field reports its own error', () => {
  const errors = validateRegister({ name: 'A', email: 'nope', phone: 'abc', password: 'weak', confirm: 'weak' });
  assert.deepEqual(Object.keys(errors).sort(), ['email', 'name', 'password', 'phone']);
  assert.match(errors.password, /8\+ characters/);
});

test('mismatched confirmation is reported only when the password itself is fine', () => {
  assert.deepEqual(validateRegister({ ...good, confirm: 'Different-1!' }), { confirm: 'Passwords do not match.' });
  assert.equal(validateRegister({ ...good, password: 'weak', confirm: 'other' }).confirm, undefined);
});

test('email, password and profile checks', () => {
  assert.deepEqual(validateEmailOnly({ email: ' Ada@Example.com ' }), {});
  assert.ok(validateEmailOnly({ email: 'x' }).email);
  assert.deepEqual(validateNewPassword({ password: good.password, confirm: good.password }), {});
  assert.ok(validateNewPassword({ password: good.password, confirm: 'x' }).confirm);
  assert.deepEqual(validateProfile({ name: 'Ada Okafor', phone: '' }), {});
  assert.ok(validateProfile({ name: '', phone: '' }).name);
  assert.equal(hasErrors({}), false);
  assert.equal(hasErrors({ a: 'b' }), true);
});
