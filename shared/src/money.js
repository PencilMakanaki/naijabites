// Money is always whole kobo (1 naira = 100 kobo). No decimals, no rounding errors.

/** Converts "6500", "6500.5" or 6500 naira to kobo. Throws RangeError for anything else. */
export function nairaToKobo(input) {
  const text = typeof input === 'number' ? String(input) : String(input ?? '').trim();
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new RangeError('Invalid naira amount');
  const kobo = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(kobo)) throw new RangeError('Invalid naira amount');
  return kobo;
}

/** Formats kobo for display: 1300000 -> "₦13,000", 650050 -> "₦6,500.50". */
export function formatNaira(kobo) {
  if (!Number.isSafeInteger(kobo) || kobo < 0) throw new RangeError('Invalid kobo amount');
  const whole = Math.floor(kobo / 100);
  const frac = kobo % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `₦${grouped}${frac ? `.${String(frac).padStart(2, '0')}` : ''}`;
}

/** Commission in kobo for an amount at a rate in basis points (1000 = 10%), rounded half up. */
export function commissionKobo(amountKobo, bps) {
  if (!Number.isSafeInteger(amountKobo) || amountKobo < 0) throw new RangeError('Invalid amount');
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new RangeError('Invalid rate');
  return Number((BigInt(amountKobo) * BigInt(bps) + 5000n) / 10000n);
}
