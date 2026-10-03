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
