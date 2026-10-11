import { addDays, DAY, dateFromKey, dateKeyInTz, DEFAULT_TZ } from "@avis/core/dates";

export const PERIODS = ["30j", "90j", "12m", "tout"] as const;
export type PeriodKey = (typeof PERIODS)[number];
export type Granularity = "day" | "week" | "month";

export interface Period {
  key: PeriodKey;
  /** Inclusive local-day bounds as UTC-midnight dates (how @db.Date columns are stored). */
  from: Date;
  to: Date;
  /** Same-length window just before `from`, for trends. */
  prevFrom: Date;
  prevTo: Date;
  granularity: Granularity;
  days: number;
}

export function isPeriodKey(v: unknown): v is PeriodKey {
  return typeof v === "string" && (PERIODS as readonly string[]).includes(v);
}

/** `earliest` bounds the "tout" period (first day with data). */
export function resolvePeriod(key: PeriodKey, now = new Date(), earliest?: Date, tz = DEFAULT_TZ): Period {
  const to = dateFromKey(dateKeyInTz(now, tz));
  const days = key === "30j" ? 30 : key === "90j" ? 90 : key === "12m" ? 365 : Math.max(30, Math.round((to.getTime() - (earliest ?? addDays(to, -365)).getTime()) / DAY) + 1);
  const from = addDays(to, -(days - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  const granularity: Granularity = days <= 45 ? "day" : days <= 200 ? "week" : "month";
  return { key, from, to, prevFrom, prevTo, granularity, days };
}

/** Start of the bucket containing `d` (weeks start on Monday, as in France). */
export function bucketStart(d: Date, g: Granularity): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (g === "week") {
    const dow = (x.getUTCDay() + 6) % 7;
    return addDays(x, -dow);
  }
  if (g === "month") return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1));
  return x;
}
