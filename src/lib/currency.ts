// Dynamic CNY to BDT conversion using app_settings
// The rate is loaded once from the database and cached for the session

let _cachedRate: number | null = null;
let _cachedMarkup: number | null = null;

export function setCnyToBdtRate(rate: number) {
  _cachedRate = rate;
}

export function setMarkupPercentage(markup: number) {
  _cachedMarkup = markup;
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
  let realPrice = basePrice || 0;
  if (Array.isArray(priceRange) && priceRange.length > 0) {
    for (const [, price] of priceRange) {
      if (typeof price === 'number' && price > realPrice) realPrice = price;
    }
  }
  return realPrice || basePrice;
}

/** CNY tier price for a SKU, scaled by the SKU's relative price vs the item's base price. */
export function getSkuTierCnyPrice(
  skuPrice: number,
  itemBasePrice: number,
  qty: number,
  priceRange?: number[][]
): number {
  const tierBase = getTierCnyPrice(itemBasePrice, qty, priceRange);
  if (!itemBasePrice || itemBasePrice <= 0) return tierBase || skuPrice;
  // Scale SKU price proportionally to the tier price (SKUs may have small price deltas).
  const ratio = tierBase / itemBasePrice;
  return skuPrice * ratio;
}

