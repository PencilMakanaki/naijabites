import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// session.js imports React Query, which is not needed to test this one pure function,
// so read the function out of the file and run it on its own.
const source = readFileSync(new URL('./session.js', import.meta.url), 'utf8');
const body = /export function safeReturnPath[\s\S]*?\n}\n/.exec(source)[0].replace('export ', '');
const safeReturnPath = new Function(`${body}; return safeReturnPath;`)();

test('return paths stay on this site', () => {
  assert.equal(safeReturnPath('/admin'), '/admin');
  assert.equal(safeReturnPath('/orders/123?x=1'), '/orders/123?x=1');
  assert.equal(safeReturnPath('//evil.example'), '/');
  assert.equal(safeReturnPath('https://evil.example'), '/');
  assert.equal(safeReturnPath('/\\evil.example'), '/');
  assert.equal(safeReturnPath(undefined), '/');
  assert.equal(safeReturnPath(null, '/home'), '/home');
});
