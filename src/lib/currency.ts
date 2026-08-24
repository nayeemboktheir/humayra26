// Dynamic CNY to BDT conversion using app_settings
// The rate is loaded once from the database and cached for the session

let _cachedRate: number | null = null;
let _cachedMarkup: number | null = null;

// Settings arrive asynchronously after first paint, so prices render with the
// fallback rate and correct themselves once the real values land. Components read
// this version through useSyncExternalStore to re-render at that moment.
let _version = 0;
const _listeners = new Set<() => void>();

function bumpVersion() {
  _version += 1;
  for (const listener of _listeners) listener();
}

export function subscribeCurrency(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function getCurrencyVersion(): number {
  return _version;
}

export function setCnyToBdtRate(rate: number) {
  if (_cachedRate === rate) return;
  _cachedRate = rate;
  bumpVersion();
}

export function setMarkupPercentage(markup: number) {
  if (_cachedMarkup === markup) return;
  _cachedMarkup = markup;
  bumpVersion();
}

export function getCnyToBdtRate(): number {
  return _cachedRate ?? 19; // fallback default (matches current admin setting)
}

export function getMarkupPercentage(): number {
  return _cachedMarkup ?? 15; // fallback default
}

export function convertToBDT(cny: number): number {
  const rate = getCnyToBdtRate();
  const markup = getMarkupPercentage();
  // Always round UP so customers never see an under-priced value
  return Math.ceil(cny * rate * (1 + markup / 100));
}

/**
 * 1688 REAL (non-discount) checkout price.
 * `priceRange` is an array of [minQty, cnyPrice] pairs from OTAPI QuantityRanges.
 *
 * Business rule (Tradeon): we ALWAYS charge customers the real 1688 retail price —
 * never any bulk/promo discount. The real price is the HIGHEST per-unit price across
 * all quantity tiers and basePrice (smallest tier = highest unit price = real price).
 * This guarantees we never under-charge regardless of qty.
 */
export function getTierCnyPrice(
  basePrice: number,
  _qty: number,
  priceRange?: number[][]
): number {
  // Real retail price = MAX of basePrice and the highest QuantityRanges tier.
  // We always take the maximum so customers are NEVER under-charged when 1688/OTAPI
  // returns inconsistent or discounted tier data.
  let highest = 0;
  if (Array.isArray(priceRange) && priceRange.length > 0) {
    for (const [, price] of priceRange) {
      if (typeof price === 'number' && price > highest) highest = price;
    }
  }
  return Math.max(highest, basePrice || 0);
}

/** CNY tier price for a SKU. SKU price is FLOORED to the real retail tier price
 *  so bulk-discounted variant prices never under-charge the customer. */
export function getSkuTierCnyPrice(
  skuPrice: number,
  itemBasePrice: number,
  qty: number,
  priceRange?: number[][]
): number {
  const tierBase = getTierCnyPrice(itemBasePrice, qty, priceRange);
  // Always charge at least the real retail tier price, even if SKU shows a lower bulk price.
  return Math.max(skuPrice || 0, tierBase || 0);
}

