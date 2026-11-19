import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentService } from '../src/payments/service.js';

const reference = 'NB_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const orderPublicId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function makeSettlementHarness({ stockOnHand = 5, quantity = 2, paymentStatus = 'initialized', gatewayStatus = 'success', orderStatus = 'pending_payment', orderPaymentStatus = 'unpaid', branchId = null, otherReserved = 0 } = {}) {
  const calls = [];
  const payment = {
    paymentId: 99,
    reference,
    amountKobo: 50000,
    currency: 'NGN',
    paymentStatus,
    orderId: 7,
    orderPublicId,
    orderStatus: paymentStatus === 'success' ? 'confirmed' : orderStatus,
    orderPaymentStatus: paymentStatus === 'success' ? 'paid' : orderPaymentStatus,
    orderTotal: 50000,
  };

  const connection = {
    async beginTransaction() { calls.push(['begin']); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
    release() { calls.push(['release']); },
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push([normalized, params]);

      if (normalized.startsWith('SELECT id, status AS orderStatus')) return [[{ orderStatus: payment.orderStatus, orderPaymentStatus: payment.orderPaymentStatus }], []];
      if (normalized.startsWith('SELECT pt.id AS paymentId, pt.reference')) return [[payment], []];
      if (normalized.startsWith('SELECT pt.id AS paymentId')) return [[{ paymentId: payment.paymentId, paymentStatus: payment.paymentStatus }], []];
      if (normalized.startsWith('SELECT oi.id AS orderItemId')) {
        return [[{ orderItemId: 501, productId: 10, quantity, branchId, trackStock: 1 }], []];
      }
      if (normalized.startsWith('SELECT id, track_stock AS trackStock')) {
        return [[{ id: 10, trackStock: 1, stockOnHand }], []];
      }
      if (normalized.startsWith('SELECT stock_on_hand AS stockOnHand FROM branch_product_inventory')) {
        return [[{ stockOnHand }], []];
      }
      if (normalized.startsWith('SELECT quantity FROM stock_reservations')) {
        return [otherReserved > 0 ? [{ quantity: otherReserved }] : [], []];
      }
      if (normalized.startsWith('SELECT id FROM stock_reservations')) return [[], []];
      if (normalized.startsWith('SELECT COALESCE(SUM(quantity), 0) AS reservedQuantity')) {
        return [[{ reservedQuantity: 0 }], []];
      }
      return [{ affectedRows: 1 }, []];
    },
  };

  const pool = {
    async getConnection() { return connection; },
    async execute(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push([normalized, params]);
      if (normalized.startsWith('SELECT pt.reference')) return [[{ reference }], []];
      if (normalized.startsWith('SELECT pt.id AS paymentId')) return [[payment], []];
      return [{ affectedRows: 1 }, []];
    },
  };

  const paystack = {
    async verify() {
      return { reference, amount: 50000, currency: 'NGN', status: gatewayStatus, id: 123456, gateway_response: 'Card declined' };
    },
  };

  const service = createPaymentService({
    pool,
    paystack,
    clientOrigin: 'https://naijabites.example',
  });

  return { service, calls };
}

test('successful settlement confirms the order and consumes stock atomically', async () => {
  const { service, calls } = makeSettlementHarness();
  const result = await service.handleWebhook({ data: { reference } });

  assert.equal(result.verified, true);
  assert.equal(result.orderStatus, 'confirmed');
  assert.equal(result.inventoryAvailable, true);
  assert.ok(calls.some(([sql]) => typeof sql === 'string' && sql.startsWith('UPDATE products SET stock_on_hand = stock_on_hand -')));
  assert.ok(calls.some(([sql]) => typeof sql === 'string' && sql.includes("SET status = 'consumed'")));
  assert.ok(calls.some(([sql]) => typeof sql === 'string' && sql.includes("SET payment_status = 'paid', status = ?")));
  assert.ok(calls.some(([name]) => name === 'commit'));
});

test('successful payment with insufficient stock enters payment_review without deducting stock', async () => {
  const { service, calls } = makeSettlementHarness({ stockOnHand: 1, quantity: 2 });
  const result = await service.handleWebhook({ data: { reference } });

  assert.equal(result.verified, true);
  assert.equal(result.orderStatus, 'payment_review');
  assert.equal(result.inventoryAvailable, false);
  assert.ok(!calls.some(([sql]) => typeof sql === 'string' && sql.startsWith('UPDATE products SET stock_on_hand = stock_on_hand -')));
  assert.ok(calls.some(([sql]) => typeof sql === 'string' && sql.includes("SET status = 'released'")));
});

test('duplicate successful webhook does not deduct stock again', async () => {
  const { service, calls } = makeSettlementHarness({ paymentStatus: 'success' });
  const result = await service.handleWebhook({ data: { reference } });

  assert.equal(result.alreadySettled, true);
  assert.equal(result.orderStatus, 'confirmed');
  assert.ok(!calls.some(([sql]) => typeof sql === 'string' && sql.startsWith('UPDATE products SET stock_on_hand = stock_on_hand -')));
});


test('failed Paystack verification records failure without marking the order paid', async () => {
  const { service, calls } = makeSettlementHarness({ gatewayStatus: 'failed' });
  const result = await service.handleWebhook({ data: { reference } });

  assert.equal(result.verified, true);
  assert.equal(result.paymentStatus, 'failed');
  assert.equal(result.retryAllowed, true);
  assert.ok(calls.some(([sql]) => typeof sql === 'string' && sql.includes('SET status = ?, failure_reason = ?')));
  assert.ok(!calls.some(([sql]) => typeof sql === 'string' && sql.includes("SET payment_status = 'paid'")));
  assert.ok(calls.some(([sql, params]) => typeof sql === 'string' && sql.includes('INSERT INTO audit_log') && params?.includes('payment.failed')));
});

test('abandoned Paystack verification is recorded as abandoned', async () => {
  const { service } = makeSettlementHarness({ gatewayStatus: 'abandoned' });
  const result = await service.handleWebhook({ data: { reference } });

  assert.equal(result.paymentStatus, 'abandoned');
  assert.equal(result.retryAllowed, true);
});


test('successful payment after vendor rejection is recorded for review without reviving the order or consuming stock', async () => {
  const { service, calls } = makeSettlementHarness({ orderStatus: 'cancelled', orderPaymentStatus: 'unpaid' });
  const result = await service.handleWebhook({ data: { reference } });

  assert.equal(result.verified, true);
  assert.equal(result.paymentStatus, 'success');
  assert.equal(result.orderStatus, 'payment_review');
  assert.equal(result.inventoryAvailable, false);
  assert.ok(!calls.some(([sql]) => typeof sql === 'string' && sql.startsWith('UPDATE products SET stock_on_hand = stock_on_hand -')));
  assert.ok(calls.some(([sql]) => typeof sql === 'string' && sql.includes("SET payment_status = 'paid', status = ?")));
  assert.ok(calls.some(([sql]) => typeof sql === 'string' && sql.includes("SET status = 'released'")));
});


test('branch-level successful settlement deducts the selected branch and writes a sale ledger movement', async () => {
  const { service, calls } = makeSettlementHarness({ branchId: 44, stockOnHand: 5, quantity: 2 });
  const result = await service.handleWebhook({ data: { reference } });

  assert.equal(result.orderStatus, 'confirmed');
  assert.ok(calls.some(([sql, params]) => typeof sql === 'string' && sql.startsWith('UPDATE branch_product_inventory') && params?.[1] === 44));
  assert.ok(calls.some(([sql, params]) => typeof sql === 'string' && sql.startsWith('INSERT INTO inventory_movements') && params?.[1] === 44 && params?.[2] === -2));
  assert.ok(!calls.some(([sql]) => typeof sql === 'string' && sql.startsWith('UPDATE products SET stock_on_hand = stock_on_hand -')));
});

test('branch-level settlement with insufficient stock enters payment review without a sale movement', async () => {
  const { service, calls } = makeSettlementHarness({ branchId: 44, stockOnHand: 1, quantity: 2 });
  const result = await service.handleWebhook({ data: { reference } });

  assert.equal(result.orderStatus, 'payment_review');
  assert.equal(result.inventoryAvailable, false);
  assert.ok(!calls.some(([sql]) => typeof sql === 'string' && sql.startsWith('UPDATE branch_product_inventory')));
  assert.ok(!calls.some(([sql]) => typeof sql === 'string' && sql.startsWith('INSERT INTO inventory_movements')));
});


test('late branch payment cannot consume stock reserved by another active order', async () => {
  const { service, calls } = makeSettlementHarness({ branchId: 44, stockOnHand: 5, quantity: 2, otherReserved: 4 });
  const result = await service.handleWebhook({ data: { reference } });

  assert.equal(result.orderStatus, 'payment_review');
  assert.equal(result.inventoryAvailable, false);
  assert.ok(!calls.some(([sql]) => typeof sql === 'string' && sql.startsWith('UPDATE branch_product_inventory')));
});

test('legacy settlement cannot consume stock reserved by another active order', async () => {
  const { service, calls } = makeSettlementHarness({
    branchId: null,
    stockOnHand: 5,
    quantity: 2,
    otherReserved: 4,
  });

  const result = await service.handleWebhook({
    data: { reference },
  });

  assert.equal(result.orderStatus, 'payment_review');
  assert.equal(result.inventoryAvailable, false);

  assert.ok(
    !calls.some(
      ([sql]) =>
        typeof sql === 'string' &&
        sql.startsWith('UPDATE products SET stock_on_hand = stock_on_hand -'),
    ),
  );
});