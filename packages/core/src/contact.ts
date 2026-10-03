/** Normalization of contact identifiers. Opt-outs are matched on these normalized forms. */

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/**
 * Normalizes a phone number to E.164, assuming France (+33) for national numbers.
 * Accepts "06 12 34 56 78", "+33 6 12 34 56 78", "0033612345678", "33612345678".
 */
export function normalizePhone(raw: string | null | undefined, defaultCountry = "33"): string | null {
  if (!raw) return null;
  let v = raw.replace(/[\s.\-()]/g, "");
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (/^0\d{9}$/.test(v)) v = `+${defaultCountry}${v.slice(1)}`;
  else if (/^33\d{9}$/.test(v)) v = `+${v}`;
  if (!/^\+[1-9]\d{7,14}$/.test(v)) return null;
  return v;
}

export function isMobileFr(e164: string): boolean {
  return /^\+33[67]\d{8}$/.test(e164);
}
