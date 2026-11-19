// Which market is "Today's Market" depends on the time in Lagos, as in the original app:
// 5am to 11am cafés and bakeries, 11am to 4pm fast food, otherwise dining.
export function marketForHour(hour) {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  return 'dinner';
}

export function lagosHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(date));
}

export const defaultMarket = (date = new Date()) => marketForHour(lagosHour(date));

export const ALL_MARKETS = Object.freeze({ code: 'all', name: 'All Markets', shortLabel: 'Everything in one place', heading: 'Explore All Markets', icon: '\u{1F6CD}\uFE0F', isMain: false });

// Shown instantly while the real list loads (and if it cannot be loaded). Mirrors migration V006.
export const FALLBACK_MARKETS = Object.freeze([
  { code: 'breakfast', name: 'Caf\u00e9s & Bakeries', shortLabel: 'Coffee, bread & pastries', heading: 'Caf\u00e9s & Bakeries Near You', blurb: 'Coffee, bread, cakes & pastries', icon: '\u2615', isMain: true },
  { code: 'lunch', name: 'Fast Food', shortLabel: 'Quick meals & takeaway', heading: 'Fast Food Near You', blurb: 'Burgers, shawarma, pizza & more', icon: '\u{1F354}', isMain: true },
  { code: 'dinner', name: 'Dining', shortLabel: 'Restaurant menus', heading: 'Dining Menus Near You', blurb: 'Restaurant meals & menus', icon: '\u{1F37D}\uFE0F', isMain: true },
  { code: 'buka', name: 'Buka (Mama Put)', shortLabel: 'Local favourites', heading: 'Buka Favourites', blurb: null, icon: '\u{1F372}', isMain: false },
  { code: 'groceries', name: 'Groceries', shortLabel: 'Farm foods & store provisions', heading: 'Groceries & Store Provisions', blurb: null, icon: '\u{1F6D2}', isMain: false },
  { code: 'livestock', name: 'Livestock', shortLabel: 'Live farm animals', heading: 'Live Animals for Sale', blurb: null, icon: '\u{1F404}', isMain: false },
]);

/** The loaded markets, or the built-in list when they could not be loaded, so the storefront never breaks. */
export const marketsOrFallback = (data) => (Array.isArray(data) && data.length > 0 ? data : FALLBACK_MARKETS);
