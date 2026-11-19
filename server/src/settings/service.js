import { AppError } from '../http/errors.js';

const ORDER_SETTING_KEYS = [
  'commission_default_bps',
  'delivery_fee_flat_kobo',
  'stock_hold_minutes',
  'delivery_pricing_mode',
  'delivery_base_fee_kobo',
  'delivery_per_km_kobo',
  'delivery_per_kg_kobo',
  'delivery_min_fee_kobo',
  'delivery_max_fee_kobo'
];

function configurationError(message) {
  return new AppError(503, 'configuration_error', message);
}

function readInteger(value, { key, min, max, nullable = false }) {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw configurationError(`The platform setting "${key}" is missing or invalid. Please contact an administrator.`);
  }
  return value;
}

export async function getOrderSettings(executor) {
  const placeholders = ORDER_SETTING_KEYS.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `SELECT setting_key, value FROM platform_settings WHERE setting_key IN (${placeholders})`,
    ORDER_SETTING_KEYS,
  );

  const settings = new Map(
    rows.map((row) => [row.setting_key, row.value]),
  );

  const commissionDefaultBps = readInteger(
    settings.get('commission_default_bps') ?? null,
    { key: 'commission_default_bps', min: 0, max: 10000, nullable: true },
  );

  if (!settings.has('stock_hold_minutes')) {
    throw configurationError('The stock hold duration is not configured. Please contact an administrator.');
  }

  const deliveryFeeFlatKobo = readInteger(
    settings.get('delivery_fee_flat_kobo') ?? null,
    { key: 'delivery_fee_flat_kobo', min: 0, max: Number.MAX_SAFE_INTEGER },
  );

  const stockHoldMinutes = readInteger(
    settings.get('stock_hold_minutes'),
    { key: 'stock_hold_minutes', min: 1, max: 1440 },
  );

  // Safely parse the pricing mode (handle JSON quotes if present)
  let deliveryPricingMode = 'flat_rate';
  const rawMode = settings.get('delivery_pricing_mode');
  if (rawMode) {
    deliveryPricingMode = String(rawMode).replace(/"/g, '');
  }

  const deliveryBaseFeeKobo = Number(settings.get('delivery_base_fee_kobo') || 0);
  const deliveryPerKmKobo = Number(settings.get('delivery_per_km_kobo') || 0);
  const deliveryPerKgKobo = Number(settings.get('delivery_per_kg_kobo') || 0);
  const deliveryMinFeeKobo = Number(settings.get('delivery_min_fee_kobo') || 0);
  const deliveryMaxFeeKobo = Number(settings.get('delivery_max_fee_kobo') || Number.MAX_SAFE_INTEGER);

  return {
    commissionDefaultBps,
    deliveryFeeFlatKobo,
    stockHoldMinutes,
    deliveryPricingMode,
    deliveryBaseFeeKobo,
    deliveryPerKmKobo,
    deliveryPerKgKobo,
    deliveryMinFeeKobo,
    deliveryMaxFeeKobo
  };
}