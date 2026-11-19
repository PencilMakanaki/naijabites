import test from 'node:test';
import assert from 'node:assert/strict';
import { createPaystackClient } from '../src/payments/paystack.js';

test('Paystack client sends a full refund request using the server-side secret', async (t) => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      async json() {
        return { status: true, message: 'Refund has been queued', data: { id: 456, status: 'pending' } };
      },
    };
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const client = createPaystackClient({ secretKey: 'sk_test_example-secret' });
  const result = await client.refund({
    transaction: 123,
    amountKobo: 125000,
    merchantNote: 'NaijaBites approved refund',
    reference: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  });

  assert.equal(captured.url, 'https://api.paystack.co/refund');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.Authorization, 'Bearer sk_test_example-secret');
  assert.deepEqual(JSON.parse(captured.options.body), {
    transaction: 123,
    amount: 125000,
    currency: 'NGN',
    merchant_note: 'NaijaBites approved refund',
    reference: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  });
  assert.equal(result.status, 'pending');
});
