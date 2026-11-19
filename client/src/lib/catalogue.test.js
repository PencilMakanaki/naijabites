import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// catalogue.js imports React Query, which this test does not need, so run just the pure helper.
const source = readFileSync(new URL('./catalogue.js', import.meta.url), 'utf8');
const body = /export function toQueryString[\s\S]*?\n}\n/.exec(source)[0].replace('export ', '');
const toQueryString = new Function(`${body}; return toQueryString;`)();

test('empty filters are left out of the address', () => {
  assert.equal(toQueryString({ market: 'dinner', q: '', vendor: undefined, cursor: null, limit: 12 }), 'market=dinner&limit=12');
  assert.equal(toQueryString({}), '');
  assert.equal(toQueryString({ q: 'jollof rice & stew' }), 'q=jollof+rice+%26+stew');
});
