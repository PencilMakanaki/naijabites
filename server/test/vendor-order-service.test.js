import test from 'node:test';
import assert from 'node:assert/strict';
import { createVendorOrderService } from '../src/orders/vendorService.js';

const ORDER_PUBLIC_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function makePool({ listRows = [], detailRows = [], items = [], summary = {}, count = 0 } = {}) {
  const calls = [];

  const pool = {
    calls,

    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });

      if (normalized.startsWith('SELECT id, status FROM vendors')) {
        return [[{ id: 7, status: 'approved' }], []];
      }

      if (normalized.startsWith('SELECT COUNT(*) AS total')) {
        return [[{ total: count }], []];
      }

      if (normalized.startsWith('SELECT COALESCE(SUM(subtotal_kobo)')) {
        return [[{
          order_value: summary.orderValue ?? 0,
          commission: summary.commission ?? 0,
          earnings: summary.earnings ?? 0,
        }], []];
      }

      if (normalized.includes('FROM vendor_orders vo') &&
          normalized.includes('recipient_name')) {
        return [detailRows, []];
      }

      if (normalized.includes('FROM vendor_orders vo')) {
        return [listRows, []];
      }

      if (normalized.startsWith('SELECT product_public_id AS productId')) {
        return [items, []];
      }

      throw new Error(`Unexpected SQL in test: ${normalized}`);
    },
  };

  return pool;
}

function vendorOrder(overrides = {}) {
  return {
    id: ORDER_PUBLIC_ID,
    order_id: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
    status: 'pending',
    order_status: 'pending_payment',
    payment_status: 'unpaid',
    vendor_name: 'Test Kitchen',
    fulfilment_branch_id: 12,
    fulfilment_branch_name: 'Ikeja Branch',
    subtotal_kobo: 10000,
    commission_kobo: 1000,
    vendor_earnings_kobo: 9000,
    created_at: '2026-11-16 10:00:00',
    updated_at: '2026-11-16 10:00:00',
    ...overrides,
  };
}

test('vendor order list returns fulfilment branch fields and financial summary', async () => {
  const pool = makePool({
    count: 2,
    summary: {
      orderValue: 30000,
      commission: 3000,
      earnings: 27000,
    },
    listRows: [
      vendorOrder(),
      vendorOrder({
        id: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
        fulfilment_branch_id: null,
        fulfilment_branch_name: null,
      }),
    ],
  });

  const service = createVendorOrderService({ pool });
  const result = await service.list(100, { page: 1, pageSize: 10 });

  assert.equal(result.orders[0].fulfilmentBranchId, 12);
  assert.equal(result.orders[0].fulfilmentBranchName, 'Ikeja Branch');

  assert.equal(result.orders[1].fulfilmentBranchId, null);
  assert.equal(result.orders[1].fulfilmentBranchName, null);

  assert.deepEqual(result.pagination.summary, {
    orderValueKobo: 30000,
    commissionKobo: 3000,
    earningsKobo: 27000,
  });

  assert.equal(result.pagination.total, 2);

  const summaryQuery = pool.calls.find(({ sql }) =>
    sql.startsWith('SELECT COALESCE(SUM(subtotal_kobo)'),
  );

  assert.ok(summaryQuery);
  assert.match(summaryQuery.sql, /status != 'cancelled'/);
  assert.deepEqual(summaryQuery.params, [7]);

  const listQuery = pool.calls.find(({ sql }) =>
    sql.includes('FROM vendor_orders vo'),
  );

  assert.match(listQuery.sql, /LEFT JOIN vendor_branches/);
  assert.match(listQuery.sql, /b\.vendor_id = vo\.vendor_id/);
  assert.deepEqual(listQuery.params, [7, 10, 0]);
});

test('vendor order detail returns its fulfilment branch fields', async () => {
  const pool = makePool({
    detailRows: [{
      ...vendorOrder(),
      internal_id: 55,
      recipient_name: 'Customer',
      recipient_phone: '08000000000',
      address_line1: '12 Test Street',
      address_line2: null,
      area: 'Ikeja',
      city: 'Lagos',
      state: 'Lagos',
      landmark: null,
      delivery_instructions: null,
    }],
    items: [{
      productId: 'PRODUCT-1',
      productName: 'Jollof Rice',
      vendorName: 'Test Kitchen',
      unit: 'portion',
      quantity: 2,
      unitPriceKobo: 5000,
      lineTotalKobo: 10000,
    }],
  });

  const service = createVendorOrderService({ pool });
  const result = await service.getById(100, ORDER_PUBLIC_ID);

  assert.equal(result.fulfilmentBranchId, 12);
  assert.equal(result.fulfilmentBranchName, 'Ikeja Branch');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, 2);

  const detailQuery = pool.calls.find(({ sql }) =>
    sql.includes('recipient_name'),
  );

  assert.match(detailQuery.sql, /LEFT JOIN vendor_branches/);
  assert.match(detailQuery.sql, /vo\.vendor_id = \?/);
  assert.deepEqual(detailQuery.params, [ORDER_PUBLIC_ID, 7]);
});

test('legacy vendor order detail preserves null fulfilment branch fields', async () => {
  const pool = makePool({
    detailRows: [{
      ...vendorOrder({
        fulfilment_branch_id: null,
        fulfilment_branch_name: null,
      }),
      internal_id: 56,
      recipient_name: 'Customer',
      recipient_phone: '08000000000',
      address_line1: '12 Test Street',
      address_line2: null,
      area: 'Ikeja',
      city: 'Lagos',
      state: 'Lagos',
      landmark: null,
      delivery_instructions: null,
    }],
  });

  const service = createVendorOrderService({ pool });
  const result = await service.getById(100, ORDER_PUBLIC_ID);

  assert.equal(result.fulfilmentBranchId, null);
  assert.equal(result.fulfilmentBranchName, null);
});

test('vendor order detail is scoped to the authenticated vendor', async () => {
  const pool = makePool({ detailRows: [] });
  const service = createVendorOrderService({ pool });

  await assert.rejects(
    service.getById(100, ORDER_PUBLIC_ID),
    (error) => error.status === 404,
  );

  const detailQuery = pool.calls.find(({ sql }) =>
    sql.includes('recipient_name'),
  );

  assert.deepEqual(detailQuery.params, [ORDER_PUBLIC_ID, 7]);
});

test('vendor order list rejects unsafe financial summary values', async () => {
  const pool = makePool({
    summary: {
      orderValue: Number.MAX_SAFE_INTEGER + 1,
      commission: 100,
      earnings: 90,
    },
  });

  const service = createVendorOrderService({ pool });

  await assert.rejects(
    service.list(100),
    (error) => error.code === 'invalid_order_amount',
  );
});