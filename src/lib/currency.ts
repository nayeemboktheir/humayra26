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
