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
 * 1688 quantity-tier pricing.
 * `priceRange` is an array of [minQty, cnyPrice] pairs from OTAPI QuantityRanges.
 * Returns the CNY price applicable for `qty`, falling back to `basePrice` if no tier matches.
 *
 * IMPORTANT: OTAPI's `ConfiguredItems[].Price.OriginalPrice` (and `Item.Price.OriginalPrice`)
 * usually reflect the LOWEST tier (bulk) price. For a customer ordering 2 pcs we must use
 * the higher per-unit tier price instead, otherwise we under-charge.
 */
export function getTierCnyPrice(
  basePrice: number,
  qty: number,
  priceRange?: number[][]
): number {
  if (!priceRange || priceRange.length === 0 || qty <= 0) return basePrice;
  // Sort ascending by minQty
  const tiers = [...priceRange].sort((a, b) => (a[0] || 0) - (b[0] || 0));
  // Find the highest tier whose minQty <= qty. If qty is below the smallest
  // tier's minQty, use the smallest tier (highest unit price) — never the bulk one.
  let chosen = tiers[0]?.[1] ?? basePrice;
  for (const [minQty, price] of tiers) {
    if (qty >= minQty) chosen = price;
  }
  // Defensive: if any tier price is HIGHER than basePrice, basePrice was the bulk
  // price. Otherwise return whichever is higher to avoid undercharging.
  return Math.max(chosen, 0) || basePrice;
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

