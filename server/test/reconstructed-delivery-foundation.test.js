import test from 'node:test';
import assert from 'node:assert/strict';
import { straightLineDistanceMeters, validCoordinates } from '../src/delivery/geo.js';
import { calculateDistanceWeightQuote } from '../src/delivery/pricing.js';
import { selectFulfilmentBranch } from '../src/inventory/branchSelection.js';

test('coordinate validation rejects missing, empty and out-of-range values', () => {
  assert.equal(validCoordinates(null, null), null);
  assert.equal(validCoordinates('', ''), null);
  assert.equal(validCoordinates(91, 0), null);
  assert.deepEqual(validCoordinates('6.5', '3.4'), { latitude: 6.5, longitude: 3.4 });
});

test('straight-line distance is finite for valid coordinates and Infinity for missing GPS', () => {
  assert.ok(straightLineDistanceMeters({ latitude: 6.5244, longitude: 3.3792 }, { latitude: 6.5245, longitude: 3.3793 }) > 0);
  assert.equal(straightLineDistanceMeters({ latitude: null, longitude: null }, { latitude: 6, longitude: 3 }), Infinity);
});

test('distance/weight pricing rounds started kilometres and kilograms using integer kobo', () => {
  const quote = calculateDistanceWeightQuote({ distanceMeters: 1001, weightGrams: 1001, baseFeeKobo: 100, perKmKobo: 50, perKgKobo: 25, minFeeKobo: 0, maxFeeKobo: 1000 });
  assert.equal(quote.feeKobo, 250);
  assert.equal(quote.billableKilometres, 2);
  assert.equal(quote.billableKilograms, 2);
});

test('distance/weight pricing applies minimum and maximum caps', () => {
  assert.equal(calculateDistanceWeightQuote({ distanceMeters: 0, weightGrams: 0, baseFeeKobo: 1, perKmKobo: 0, perKgKobo: 0, minFeeKobo: 100, maxFeeKobo: 500 }).feeKobo, 100);
  assert.equal(calculateDistanceWeightQuote({ distanceMeters: 5000, weightGrams: 5000, baseFeeKobo: 100, perKmKobo: 100, perKgKobo: 100, minFeeKobo: 0, maxFeeKobo: 250 }).feeKobo, 250);
});

test('branch selector requires all items at one active branch and ranks by proximity', () => {
  const branches = [
    { id: 2, isActive: true, latitude: 6.5, longitude: 3.4, inventory: { '10': 2, '11': 2 } },
    { id: 1, isActive: true, latitude: 6.51, longitude: 3.41, inventory: { '10': 5 } },
    { id: 3, isActive: false, latitude: 6.5, longitude: 3.4, inventory: { '10': 5, '11': 5 } },
  ];
  const chosen = selectFulfilmentBranch({ branches, items: [{ productId: 10, quantity: 1 }, { productId: 11, quantity: 2 }], customerCoordinates: { latitude: 6.5001, longitude: 3.4001 } });
  assert.equal(chosen.id, 2);
});

test('branch selector does not split a vendor order across branches', () => {
  const branches = [
    { id: 1, isActive: true, inventory: { '10': 5 } },
    { id: 2, isActive: true, inventory: { '11': 5 } },
  ];
  assert.equal(selectFulfilmentBranch({ branches, items: [{ productId: 10, quantity: 1 }, { productId: 11, quantity: 1 }] }), null);
});

test('migration directory contains a complete consecutive up/down sequence through the latest migration', async () => {
  const { readdir } = await import('node:fs/promises');
  const { collectMigrations } = await import('../src/db/migrate-core.js');
  const names = await readdir(new URL('../migrations/', import.meta.url));
  const { migrations, problems } = collectMigrations(names);
  assert.deepEqual(problems, []);
  assert.ok(migrations.length >= 1, 'at least one migration must exist');
  assert.equal(migrations.at(0).version, 1);
  assert.equal(migrations.at(-1).version, migrations.length);
  assert.deepEqual(migrations.map((migration) => migration.version), Array.from({ length: migrations.length }, (_, index) => index + 1));
});

test('branch selector treats database false flags as disabled, including string zero', () => {
  const branches = [
    { id: 1, isActive: '0', inventory: { '10': 5 } },
    { id: 2, isActive: 1, isEnabled: '0', inventory: { '10': 5 } },
    { id: 3, isActive: 1, isEnabled: 1, inventory: { '10': 5 } },
  ];
  assert.equal(selectFulfilmentBranch({ branches, items: [{ productId: 10, quantity: 1 }] }).id, 3);
});

test('branch selector treats invalid inventory values as unavailable', () => {
  const branches = [
    { id: 1, isActive: true, inventory: { '10': 'not-a-number' } },
    { id: 2, isActive: true, inventory: { '10': -1 } },
  ];
  assert.equal(selectFulfilmentBranch({ branches, items: [{ productId: 10, quantity: 1 }] }), null);
});

test('branch selector uses stable branch id ordering when GPS coordinates are unavailable', () => {
  const branches = [
    { id: 9, isActive: true, inventory: { '10': 2 } },
    { id: 4, isActive: true, inventory: { '10': 2 } },
  ];
  assert.equal(selectFulfilmentBranch({ branches, items: [{ productId: 10, quantity: 1 }] }).id, 4);
});

test('branch selector chooses an active branch for an order with no stock-tracked items', () => {
  const branches = [
    { id: 8, isActive: true, latitude: 6.6, longitude: 3.5 },
    { id: 3, isActive: true, latitude: 6.5, longitude: 3.4 },
    { id: 1, isActive: false, latitude: 6.5, longitude: 3.4 },
  ];
  assert.equal(selectFulfilmentBranch({ branches, items: [] }).id, 3);
});
