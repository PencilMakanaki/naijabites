import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_MARKETS, FALLBACK_MARKETS, defaultMarket, lagosHour, marketForHour, marketsOrFallback } from './markets.js';

test('the market follows the time of day, like the original app', () => {
  const at = (h) => marketForHour(h);
  assert.deepEqual([4, 5, 10, 11, 15, 16, 21, 23, 0].map(at), ['dinner', 'breakfast', 'breakfast', 'lunch', 'lunch', 'dinner', 'dinner', 'dinner', 'dinner']);
});

test('Lagos time is used, whatever the visitor\u2019s own time zone', () => {
  assert.equal(lagosHour(new Date('2026-11-10T07:00:00Z')), 8); // Lagos is one hour ahead of UTC
  assert.equal(lagosHour(new Date('2026-11-10T23:30:00Z')), 0);
  assert.equal(defaultMarket(new Date('2026-11-10T07:00:00Z')), 'breakfast');
  assert.equal(defaultMarket(new Date('2026-11-10T11:00:00Z')), 'lunch');
  assert.equal(defaultMarket(new Date('2026-11-10T17:00:00Z')), 'dinner');
});

test('the built-in market list has the six markets and three main tabs', () => {
  assert.equal(FALLBACK_MARKETS.length, 6);
  assert.deepEqual(FALLBACK_MARKETS.filter((m) => m.isMain).map((m) => m.code), ['breakfast', 'lunch', 'dinner']);
  assert.equal(ALL_MARKETS.code, 'all');
});

test('a failed or empty markets request falls back to the built-in list instead of breaking the page', () => {
  for (const bad of [undefined, null, [], 'oops', {}]) assert.equal(marketsOrFallback(bad), FALLBACK_MARKETS);
  const loaded = [{ code: 'dinner', name: 'Dining', isMain: true }];
  assert.equal(marketsOrFallback(loaded), loaded);
});
