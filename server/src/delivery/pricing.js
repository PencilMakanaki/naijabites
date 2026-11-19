import { AppError } from '../http/errors.js';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
function nonNegativeInt(value, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new AppError(422, 'invalid_delivery_pricing', `${label} must be a non-negative safe integer.`);
  return BigInt(n);
}

// All monetary arithmetic is integer kobo. Distance and weight are rounded up
// to started kilometres/kilograms to avoid fractional-kobo calculations.
export function calculateDistanceWeightQuote({ distanceMeters, weightGrams, baseFeeKobo, perKmKobo, perKgKobo, minFeeKobo = 0, maxFeeKobo = Number.MAX_SAFE_INTEGER }) {
  const distance = nonNegativeInt(distanceMeters, 'Distance');
  const weight = nonNegativeInt(weightGrams, 'Weight');
  const base = nonNegativeInt(baseFeeKobo, 'Base fee');
  const kmRate = nonNegativeInt(perKmKobo, 'Per-kilometre fee');
  const kgRate = nonNegativeInt(perKgKobo, 'Per-kilogram fee');
  const min = nonNegativeInt(minFeeKobo, 'Minimum fee');
  const max = nonNegativeInt(maxFeeKobo, 'Maximum fee');
  if (max < min) throw new AppError(422, 'invalid_delivery_pricing', 'Maximum fee cannot be lower than minimum fee.');
  const km = (distance + 999n) / 1000n;
  const kg = (weight + 999n) / 1000n;
  let fee = base + km * kmRate + kg * kgRate;
  if (fee < min) fee = min;
  if (fee > max) fee = max;
  if (fee > MAX_SAFE) throw new AppError(422, 'delivery_quote_limit', 'Delivery quote exceeds the supported amount.');
  return { feeKobo: Number(fee), distanceMeters: Number(distance), weightGrams: Number(weight), billableKilometres: Number(km), billableKilograms: Number(kg) };
}
