import test from 'node:test';
import assert from 'node:assert/strict';
import { commissionKobo, formatNaira, nairaToKobo } from '../src/money.js';

test('nairaToKobo uses exact whole-number arithmetic', () => {
  assert.equal(nairaToKobo('6500'), 650000);
  assert.equal(nairaToKobo(4000), 400000);
  assert.equal(nairaToKobo('6500.5'), 650050);
  assert.equal(nairaToKobo('0.07'), 7);
  assert.equal(nairaToKobo('19.99'), 1999); // floating point would give 1998.9999...
  for (const bad of ['', '-5', '1.234', 'abc', '1e5', '1,000', '1.', null, undefined, NaN, '9'.repeat(13)]) {
    assert.throws(() => nairaToKobo(bad), RangeError, `should reject ${String(bad)}`);
  }
});

test('formatNaira groups thousands and shows kobo only when needed', () => {
  assert.equal(formatNaira(0), '₦0');
  assert.equal(formatNaira(1300000), '₦13,000');
  assert.equal(formatNaira(650050), '₦6,500.50');
  assert.equal(formatNaira(7), '₦0.07');
  assert.equal(formatNaira(123456789000), '₦1,234,567,890');
  assert.throws(() => formatNaira(-1), RangeError);
  assert.throws(() => formatNaira(1.5), RangeError);
});

test('commissionKobo rounds half up and never overflows', () => {
  assert.equal(commissionKobo(1300000, 1000), 130000); // 10% of N13,000
  assert.equal(commissionKobo(5, 1000), 1); // 0.5 kobo rounds up
  assert.equal(commissionKobo(4, 1000), 0);
  assert.equal(commissionKobo(100, 0), 0);
  assert.equal(commissionKobo(100, 10000), 100);
  assert.equal(commissionKobo(9_000_000_000_000, 1500), 1_350_000_000_000);
  assert.throws(() => commissionKobo(100, 10001), RangeError);
  assert.throws(() => commissionKobo(-1, 100), RangeError);
});
