// Dynamic CNY to BDT conversion using app_settings
// The rate is loaded once from the database and cached for the session

let _cachedRate: number | null = null;

export function setCnyToBdtRate(rate: number) {
  _cachedRate = rate;
}

export function getCnyToBdtRate(): number {
  return _cachedRate ?? 17.5; // fallback default
}

export function convertToBDT(cny: number): number {
  return Math.round(cny * getCnyToBdtRate());
}
