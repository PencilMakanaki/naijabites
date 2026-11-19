import test from 'node:test';
import assert from 'node:assert/strict';
import { assignFulfilmentBranches } from '../src/orders/service.js';

function makeConnection({ branchRows = [], configuredRows = [], reservations = [], legacyReservations = [], legacyBranchRows = [] } = {}) {
  const calls = [];
  return {
    calls,
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized.startsWith('SELECT b.id AS branchId')) return [branchRows, []];
      if (normalized.startsWith('SELECT branch_id AS branchId, product_id AS productId FROM branch_product_inventory')) return [configuredRows, []];
      if (normalized.startsWith('SELECT branch_id AS branchId, product_id AS productId, quantity')) return [reservations, []];
      if (normalized.startsWith('SELECT sr.id FROM stock_reservations')) return [legacyReservations, []];
      if (normalized.startsWith('SELECT id FROM branch_product_inventory')) return [legacyBranchRows, []];
      if (normalized.startsWith('SELECT sr.quantity FROM stock_reservations')) return [[], []];
      return [{ affectedRows: 1, insertId: 1 }, []];
    },
  };
}

function group(items, vendorId = 7) {
  return [{
    vendorId,
    vendorName: 'Test Kitchen',
    items: items.map(({ id, quantity, stockOnHand = 0 }) => ({
      quantity,
      product: { id, trackStock: 1, stockOnHand, name: `Product ${id}` },
    })),
  }];
}

const address = { latitude: 6.5244, longitude: 3.3792 };

test('checkout branch allocation chooses a branch that can fulfil every tracked item', async () => {
  const connection = makeConnection({
    branchRows: [
      { branchId: 1, latitude: 6.5245, longitude: 3.3793, isActive: 1, productId: 10, stockOnHand: 1 },
      { branchId: 2, latitude: 6.55, longitude: 3.4, isActive: 1, productId: 10, stockOnHand: 5 },
      { branchId: 1, latitude: 6.5245, longitude: 3.3793, isActive: 1, productId: 11, stockOnHand: 3 },
      { branchId: 2, latitude: 6.55, longitude: 3.4, isActive: 1, productId: 11, stockOnHand: 3 },
    ],
    configuredRows: [{ branchId: 1, productId: 10 }, { branchId: 2, productId: 10 }, { branchId: 1, productId: 11 }, { branchId: 2, productId: 11 }],
  });
  const groups = group([{ id: 10, quantity: 2 }, { id: 11, quantity: 2 }]);

  await assignFulfilmentBranches(connection, groups, address);

  assert.equal(groups[0].branchId, 2);
});

test('checkout branch allocation subtracts reservations before choosing a branch', async () => {
  const connection = makeConnection({
    branchRows: [
      { branchId: 1, latitude: 6.5245, longitude: 3.3793, isActive: 1, productId: 10, stockOnHand: 5 },
      { branchId: 2, latitude: 6.55, longitude: 3.4, isActive: 1, productId: 10, stockOnHand: 5 },
    ],
    configuredRows: [{ branchId: 1, productId: 10 }, { branchId: 2, productId: 10 }],
    reservations: [{ branchId: 1, productId: 10, quantity: 4 }, { branchId: 2, productId: 10, quantity: 1 }],
  });
  const groups = group([{ id: 10, quantity: 2 }]);

  await assignFulfilmentBranches(connection, groups, address);

  assert.equal(groups[0].branchId, 2);
});

test('checkout refuses to split one vendor order across branches', async () => {
  const connection = makeConnection({
    branchRows: [
      { branchId: 1, latitude: 6.5, longitude: 3.4, isActive: 1, productId: 10, stockOnHand: 5 },
      { branchId: 2, latitude: 6.5, longitude: 3.4, isActive: 1, productId: 11, stockOnHand: 5 },
    ],
    configuredRows: [{ branchId: 1, productId: 10 }, { branchId: 2, productId: 11 }],
  });
  const groups = group([{ id: 10, quantity: 1 }, { id: 11, quantity: 1 }]);

  await assert.rejects(
    assignFulfilmentBranches(connection, groups, address),
    (error) => error.status === 409,
  );
});

test('checkout preserves legacy stock only when the vendor has no branches or branch stock', async () => {
  const connection = makeConnection({ branchRows: [], legacyBranchRows: [] });
  const groups = group([{ id: 10, quantity: 2, stockOnHand: 5 }]);

  await assignFulfilmentBranches(connection, groups, address);

  assert.equal(groups[0].branchId, null);
});

test('checkout blocks branch migration while an older product-level reservation is active', async () => {
  const connection = makeConnection({
    branchRows: [{ branchId: 1, latitude: 6.5, longitude: 3.4, isActive: 1, productId: 10, stockOnHand: 5 }],
    legacyReservations: [{ id: 99 }],
  });
  const groups = group([{ id: 10, quantity: 1 }]);

  await assert.rejects(
    assignFulfilmentBranches(connection, groups, address),
    (error) => error.status === 409,
  );
});

test('first branch checkout imports legacy product stock once and records an opening movement', async () => {
  const connection = makeConnection({
    branchRows: [
      { branchId: 1, latitude: 6.5, longitude: 3.4, isActive: 1, productId: null, stockOnHand: null },
    ],
    configuredRows: [],
  });
  const groups = group([{ id: 10, quantity: 2, stockOnHand: 6 }]);

  await assignFulfilmentBranches(connection, groups, address);

  assert.equal(groups[0].branchId, 1);
  assert.ok(connection.calls.some(({ sql, params }) => sql.startsWith('INSERT INTO branch_product_inventory') && params[3] === 6));
  assert.ok(connection.calls.some(({ sql, params }) => sql.startsWith('INSERT INTO inventory_movements') && sql.includes('legacy_stock_import')));
});

test('checkout does not copy legacy stock into an active branch when stock already exists at an inactive branch', async () => {
  const connection = makeConnection({
    branchRows: [
      { branchId: 1, latitude: 6.5, longitude: 3.4, isActive: 1, productId: null, stockOnHand: null },
    ],
    configuredRows: [{ branchId: 9, productId: 10 }],
  });
  const groups = group([{ id: 10, quantity: 1, stockOnHand: 10 }]);

  await assert.rejects(
    assignFulfilmentBranches(connection, groups, address),
    (error) => error.status === 409,
  );
  assert.ok(!connection.calls.some(({ sql }) => sql.startsWith('INSERT INTO branch_product_inventory')));
});
