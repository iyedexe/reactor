/** Number/date formatting shared by server and client components (French by default). */

export function fmtNumber(v: number | null | undefined, locale = "fr-FR", digits = 0): string {
  if (v == null || Number.isNaN(v)) return "–";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

export function fmtRating(v: number | null | undefined, locale = "fr-FR"): string {
  return fmtNumber(v, locale, 1);
}

export function fmtPct(v: number | null | undefined, locale = "fr-FR", digits = 0): string {
  if (v == null || Number.isNaN(v)) return "–";
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(v);
}

export function fmtHours(h: number | null | undefined, locale = "fr-FR"): string {
  if (h == null) return "–";
  if (h < 1) return `${fmtNumber(h * 60, locale)} min`;
  if (h < 48) return `${fmtNumber(h, locale, h < 10 ? 1 : 0)} h`;
  return `${fmtNumber(h / 24, locale, 1)} j`;
}

export function fmtDate(iso: string, locale = "fr-FR", opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...opts }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));
}
