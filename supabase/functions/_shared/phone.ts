export function normalizeBangladeshPhone(value: unknown): string | null {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (digits.startsWith("0")) {
    digits = `880${digits.slice(1)}`;
  } else if (!digits.startsWith("880")) {
    digits = `880${digits}`;
  }

  return /^8801\d{9}$/.test(digits) ? digits : null;
}
