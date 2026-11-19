import test from 'node:test';
import assert from 'node:assert/strict';
import { addCartItemSchema, cartQuantitySchema } from '../src/cart/schemas.js';

const productId = '01J8Z7M4T6Q2K9W3X5A1B8C0DE';

test('cart add schema accepts a valid public product id and defaults quantity to one', () => {
  assert.deepEqual(addCartItemSchema.parse({ productId }), { productId, quantity: 1 });
});

test('cart add schema rejects malformed ids and quantities outside the supported range', () => {
  assert.equal(addCartItemSchema.safeParse({ productId: 'not-an-id' }).success, false);
  assert.equal(addCartItemSchema.safeParse({ productId, quantity: 0 }).success, false);
  assert.equal(addCartItemSchema.safeParse({ productId, quantity: 51 }).success, false);
});

test('cart quantity schema requires a whole number from one through fifty', () => {
  assert.equal(cartQuantitySchema.safeParse({ quantity: 2 }).success, true);
  assert.equal(cartQuantitySchema.safeParse({ quantity: 1.5 }).success, false);
  assert.equal(cartQuantitySchema.safeParse({ quantity: 0 }).success, false);
});
