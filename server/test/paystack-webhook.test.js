import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyPaystackWebhook } from '../src/payments/webhook.js';

const rawBody = Buffer.from('{"event":"charge.success","data":{"reference":"NB_01ARZ3NDEKTSV4RRFFQ69G5FAV"}}');
const secretKey = 'sk_test_webhook-test-secret';
const webhookSecret = 'whsec_webhook-test-secret';

test('accepts a valid legacy Paystack webhook signature', () => {
  const signature = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
  assert.equal(
    verifyPaystackWebhook({
      rawBody,
      headers: { 'x-paystack-signature': signature },
      secretKey,
    }),
    true,
  );
});

test('rejects an invalid legacy Paystack webhook signature', () => {
  assert.equal(
    verifyPaystackWebhook({
      rawBody,
      headers: { 'x-paystack-signature': '0'.repeat(128) },
      secretKey,
    }),
    false,
  );
});

test('accepts a valid timestamped Paystack-Signature', () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const keyId = 'whk_testKey123';
  const signature = crypto
    .createHmac('sha512', webhookSecret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  assert.equal(
    verifyPaystackWebhook({
      rawBody,
      headers: { 'paystack-signature': `t=${timestamp},v1=${keyId}:${signature}` },
      webhookSecret,
    }),
    true,
  );
});

test('rejects an expired timestamped Paystack-Signature', () => {
  const timestamp = Math.floor(Date.now() / 1000) - 600;
  const keyId = 'whk_testKey123';
  const signature = crypto
    .createHmac('sha512', webhookSecret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');

  assert.equal(
    verifyPaystackWebhook({
      rawBody,
      headers: { 'paystack-signature': `t=${timestamp},v1=${keyId}:${signature}` },
      webhookSecret,
    }),
    false,
  );
});

test('does not downgrade to legacy signature when modern signature is present but invalid', () => {
  const legacySignature = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
  assert.equal(
    verifyPaystackWebhook({
      rawBody,
      headers: {
        'paystack-signature': 't=1,v1=whk_testKey123:invalid',
        'x-paystack-signature': legacySignature,
      },
      webhookSecret,
      secretKey,
    }),
    false,
  );
});
