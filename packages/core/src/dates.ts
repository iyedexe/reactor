import { TZDate } from "@date-fns/tz";

export const DEFAULT_TZ = "Europe/Paris";

/** "YYYY-MM-DD" of an instant as seen in a time zone. */
export function dateKeyInTz(d: Date, tz = DEFAULT_TZ): string {
  const z = new TZDate(d.getTime(), tz);
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const day = String(z.getDate()).padStart(2, "0");
  return `${z.getFullYear()}-${m}-${day}`;
}

/** A UTC midnight Date for a "YYYY-MM-DD" key (how @db.Date columns are stored). */
export function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const WEEK = 7 * DAY;

/** The instant a local day starts, e.g. "2026-03-29" in Europe/Paris → 2026-03-28T23:00:00Z. */
export function startOfLocalDay(key: string, tz = DEFAULT_TZ): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, tz).getTime());
}

/** Instant range [start, end) covering local days `fromKey`..`toKey` inclusive. */
export function localDayRange(fromKey: string, toKey: string, tz = DEFAULT_TZ): { gte: Date; lt: Date } {
  const end = dateFromKey(toKey);
  return { gte: startOfLocalDay(fromKey, tz), lt: startOfLocalDay(addDays(end, 1).toISOString().slice(0, 10), tz) };
}
