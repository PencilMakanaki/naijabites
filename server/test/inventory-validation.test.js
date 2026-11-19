import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/http/errors.js';
import { MAX_BRANCH_STOCK, validateInventoryMovement } from '../src/inventory/validation.js';

function expectError(fn, status, code) {
  assert.throws(fn, (error) => error instanceof AppError && error.status === status && (!code || error.code === code));
}

test('restock and return movements must increase stock', () => {
  assert.deepEqual(validateInventoryMovement({ quantityBefore: 4, quantityDelta: 3, movementType: 'restock' }), { before: 4, after: 7 });
  assert.deepEqual(validateInventoryMovement({ quantityBefore: 4, quantityDelta: 1, movementType: 'return' }), { before: 4, after: 5 });
  expectError(() => validateInventoryMovement({ quantityBefore: 4, quantityDelta: -1, movementType: 'restock' }), 400);
  expectError(() => validateInventoryMovement({ quantityBefore: 4, quantityDelta: -1, movementType: 'return' }), 400);
});

test('damage movements must decrease stock while adjustments may move either way', () => {
  assert.deepEqual(validateInventoryMovement({ quantityBefore: 4, quantityDelta: -2, movementType: 'damage' }), { before: 4, after: 2 });
  assert.deepEqual(validateInventoryMovement({ quantityBefore: 4, quantityDelta: -2, movementType: 'adjustment' }), { before: 4, after: 2 });
  assert.deepEqual(validateInventoryMovement({ quantityBefore: 4, quantityDelta: 2, movementType: 'adjustment' }), { before: 4, after: 6 });
  expectError(() => validateInventoryMovement({ quantityBefore: 4, quantityDelta: 2, movementType: 'damage' }), 400);
});

test('inventory movements reject zero, fractions, excessive deltas and unknown types', () => {
  for (const quantityDelta of [0, 1.5, 1_000_001, Number.NaN]) {
    expectError(() => validateInventoryMovement({ quantityBefore: 4, quantityDelta, movementType: 'adjustment' }), 400);
  }
  expectError(() => validateInventoryMovement({ quantityBefore: 4, quantityDelta: 1, movementType: 'sale' }), 400);
});

test('inventory balances cannot become negative or exceed MySQL INT UNSIGNED', () => {
  expectError(() => validateInventoryMovement({ quantityBefore: 1, quantityDelta: -2, movementType: 'adjustment' }), 409, 'insufficient_branch_stock');
  expectError(() => validateInventoryMovement({ quantityBefore: MAX_BRANCH_STOCK, quantityDelta: 1, movementType: 'restock' }), 409, 'branch_stock_limit_exceeded');
  expectError(() => validateInventoryMovement({ quantityBefore: -1, quantityDelta: 1, movementType: 'restock' }), 409);
});
