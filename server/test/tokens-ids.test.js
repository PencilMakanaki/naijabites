import test from 'node:test';
import assert from 'node:assert/strict';
import { hashToken, newToken, safeEqual } from '../src/security/tokens.js';
import { ulid } from '../src/security/ids.js';

test('tokens are long, random and stored only as a hash', () => {
  const a = newToken();
  const b = newToken();
  assert.match(a, /^[\w-]{43}$/);
  assert.notEqual(a, b);
  assert.match(hashToken(a), /^[0-9a-f]{64}$/);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), hashToken(b));
});

test('safeEqual compares strings in constant time and handles different lengths', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('', ''), true);
});

test('ULIDs: 26 URL-safe characters, unique, and sortable by time', () => {
  const ids = Array.from({ length: 2000 }, () => ulid());
  for (const id of ids) assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.equal(new Set(ids).size, ids.length);
  const early = ulid(1_700_000_000_000);
  const late = ulid(1_800_000_000_000);
  assert.ok(early < late);
  assert.equal(ulid(0).slice(0, 10), '0000000000');
});
