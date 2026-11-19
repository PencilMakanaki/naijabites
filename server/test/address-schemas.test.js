import test from 'node:test';
import assert from 'node:assert/strict';
import { addressSchema, addressUpdateSchema } from '../src/addresses/schemas.js';

const valid = {
  recipientName: 'Ada Okafor', phone: '+234 803 123 4567', addressLine1: '12 Palm Avenue',
  area: 'Ikeja GRA', city: 'Ikeja', state: 'Lagos',
};

test('delivery address accepts a valid Nigerian address and normalizes optional fields', () => {
  const result = addressSchema.parse(valid);
  assert.equal(result.phone, '+2348031234567');
  assert.equal(result.addressLine2, null);
  assert.equal(result.landmark, null);
  assert.equal(result.deliveryInstructions, null);
  assert.equal(result.isDefault, false);
});

test('delivery address rejects missing required fields and invalid phone numbers', () => {
  assert.equal(addressSchema.safeParse({ ...valid, phone: 'abc' }).success, false);
  assert.equal(addressSchema.safeParse({ ...valid, area: '' }).success, false);
});

test('delivery address rejects unknown request properties', () => {
  assert.equal(addressSchema.safeParse({ ...valid, userId: 1 }).success, false);
});

test('delivery address update accepts a partial update but rejects an empty object', () => {
  assert.equal(addressUpdateSchema.safeParse({ city: 'Abuja' }).success, true);
  assert.equal(addressUpdateSchema.safeParse({}).success, false);
});
