import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail, isValidFullName, normalizeEmail, normalizeName, normalizePhone, passwordProblem, MESSAGES } from '../src/rules.js';

test('email: trimmed, lower-cased, same pattern as the old app', () => {
  assert.equal(normalizeEmail('  Ada@Example.COM '), 'ada@example.com');
  assert.equal(isValidEmail('ada@example.com'), true);
  assert.equal(isValidEmail('ada@example'), false);
  assert.equal(isValidEmail('ada @example.com'), false);
  assert.equal(isValidEmail('ada@example.c'), false); // the old rule needs 2+ letters after the dot
  assert.equal(isValidEmail(`${'a'.repeat(250)}@x.com`), false); // longer than 254
});

test('full name: 2 to 80 characters', () => {
  assert.equal(isValidFullName(normalizeName('  Ada Okafor ')), true);
  assert.equal(isValidFullName('A'), false);
  assert.equal(isValidFullName('A'.repeat(80)), true);
  assert.equal(isValidFullName('A'.repeat(81)), false);
  assert.equal(isValidFullName('😀'.repeat(80)), true); // counts characters, not code units
});

test('password: same rule as the sign-up form, plus a 128 character cap', () => {
  assert.equal(passwordProblem('Abcdef1!'), null);
  assert.equal(passwordProblem('abcdef1!'), MESSAGES.password); // no upper case
  assert.equal(passwordProblem('ABCDEF1!'), MESSAGES.password); // no lower case
  assert.equal(passwordProblem('Abcdefg!'), MESSAGES.password); // no number
  assert.equal(passwordProblem('Abcdefg1'), MESSAGES.password); // no symbol
  assert.equal(passwordProblem('Ab1!'), MESSAGES.password); // too short
  assert.equal(passwordProblem(`Aa1!${'x'.repeat(125)}`), MESSAGES.passwordTooLong);
  assert.equal(passwordProblem(undefined), MESSAGES.password);
});

test('phone: optional, Nigerian numbers stored as +234...', () => {
  assert.deepEqual(normalizePhone(''), { ok: true, value: null });
  assert.deepEqual(normalizePhone(undefined), { ok: true, value: null });
  assert.deepEqual(normalizePhone('0803 123 4567'), { ok: true, value: '+2348031234567' });
  assert.deepEqual(normalizePhone('+234 803 123 4567'), { ok: true, value: '+2348031234567' });
  assert.deepEqual(normalizePhone('234-803-123-4567'), { ok: true, value: '+2348031234567' });
  assert.deepEqual(normalizePhone('(0803) 123.4567'), { ok: true, value: '+2348031234567' });
  assert.equal(normalizePhone('+2348031234').ok, false); // wrong length for +234
  assert.equal(normalizePhone('abc123456').ok, false);
  assert.equal(normalizePhone('12345').ok, false); // too short
  assert.equal(normalizePhone('+44 20 7946 0958').ok, true); // other countries are kept
});
