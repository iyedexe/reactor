import { addDays, DAY, HOUR, WEEK } from "@avis/core/dates";
import { bucketStart, type Granularity } from "./period.ts";

/**
 * Metric definitions. Pure functions over LocationDailyStat-shaped rows, so every number on the dashboard
 * and in the monthly report is computed in one tested place.
 *
 * Multi-location aggregation: counts are summed; ratings are weighted by each location's review count.
 */

export interface DailyRow {
  locationId: string;
  date: Date;
  rating: number | null;
  totalReviews: number;
  newReviews: number;
  ratingSum: number;
  repliedReviews: number;
  responseHoursSum: number;
  scans: number;
  googleClicks: number;
  feedbacks: number;
  messagesSent: number;
  messageClicks: number;
  attributedReviews: number;
}

export interface Totals {
  newReviews: number;
  ratingSum: number;
  repliedReviews: number;
  responseHoursSum: number;
  scans: number;
  googleClicks: number;
  feedbacks: number;
  messagesSent: number;
  messageClicks: number;
  attributedReviews: number;
}

const ZERO: Totals = {
  newReviews: 0,
  ratingSum: 0,
  repliedReviews: 0,
  responseHoursSum: 0,
  scans: 0,
  googleClicks: 0,
  feedbacks: 0,
  messagesSent: 0,
  messageClicks: 0,
  attributedReviews: 0,
};

const inRange = (d: Date, from: Date, to: Date) => d.getTime() >= from.getTime() && d.getTime() <= to.getTime();

export function sumRows(rows: DailyRow[], from?: Date, to?: Date): Totals {
  const t = { ...ZERO };
  for (const r of rows) {
    if (from && to && !inRange(r.date, from, to)) continue;
    for (const k of Object.keys(ZERO) as (keyof Totals)[]) t[k] += r[k];
  }
  return t;
}

/** Share of reviews that got a reply (0..1), or null with no reviews. */
export function responseRate(t: Pick<Totals, "newReviews" | "repliedReviews">): number | null {
  return t.newReviews ? t.repliedReviews / t.newReviews : null;
}

export function avgResponseHours(t: Pick<Totals, "repliedReviews" | "responseHoursSum">): number | null {
  return t.repliedReviews ? t.responseHoursSum / t.repliedReviews : null;
}

/** Average stars of reviews received in the window. */
export function avgNewRating(t: Pick<Totals, "newReviews" | "ratingSum">): number | null {
  return t.newReviews ? t.ratingSum / t.newReviews : null;
}

/** Reviews per week over a window of `days` days. */
export function velocity(newReviews: number, days: number): number {
  return days > 0 ? (newReviews / days) * 7 : 0;
}

/** Latest row per location on or before `at`. */
function latestPerLocation(rows: DailyRow[], at: Date): Map<string, DailyRow> {
  const out = new Map<string, DailyRow>();
  for (const r of rows) {
    if (r.date.getTime() > at.getTime()) continue;
    const cur = out.get(r.locationId);
    if (!cur || cur.date < r.date) out.set(r.locationId, r);
  }
  return out;
}

/** Aggregate rating and review count as of a day (weighted by review count). */
export function snapshotAt(rows: DailyRow[], at: Date): { rating: number | null; totalReviews: number } {
  let total = 0;
  let weighted = 0;
  for (const r of latestPerLocation(rows, at).values()) {
    total += r.totalReviews;
    if (r.rating != null) weighted += r.rating * r.totalReviews;
  }
  return { rating: total ? weighted / total : null, totalReviews: total };
}

export interface Trend {
  value: number | null;
  previous: number | null;
  delta: number | null;
  /** Relative change (0.1 = +10%), null when previous is 0/null. */
  pct: number | null;
}

export function trend(value: number | null, previous: number | null): Trend {
  const delta = value != null && previous != null ? value - previous : null;
  const pct = delta != null && previous ? delta / previous : null;
  return { value, previous, delta, pct };
}

export interface SeriesPoint {
  date: string; // YYYY-MM-DD bucket start
  newReviews: number;
  avgStars: number | null; // of reviews received in the bucket
  totalReviews: number; // cumulative at bucket end
  rating: number | null; // overall rating at bucket end
}

/** Time series bucketed by day/week/month between from and to (inclusive). */
export function buildSeries(rows: DailyRow[], from: Date, to: Date, g: Granularity): SeriesPoint[] {
  const buckets = new Map<number, { rows: DailyRow[]; end: Date }>();
  for (let d = bucketStart(from, g); d.getTime() <= to.getTime(); ) {
    const next = g === "day" ? addDays(d, 1) : g === "week" ? addDays(d, 7) : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const end = new Date(Math.min(next.getTime() - DAY, to.getTime()));
    buckets.set(d.getTime(), { rows: [], end });
    d = next;
  }
  for (const r of rows) {
    if (!inRange(r.date, from, to)) continue;
    buckets.get(bucketStart(r.date, g).getTime())?.rows.push(r);
  }
  return [...buckets.entries()].map(([start, b]) => {
    const t = sumRows(b.rows);
    const snap = snapshotAt(rows, b.end);
    return {
      date: new Date(start).toISOString().slice(0, 10),
      newReviews: t.newReviews,
      avgStars: avgNewRating(t),
      totalReviews: snap.totalReviews,
      rating: snap.rating,
    };
  });
}

export interface BaselineLike {
  rating: number;
  reviewCount: number;
  velocityPerWeek: number;
  responseRate: number;
  avgResponseHours: number | null;
}

/** Aggregates per-location baselines the same way as current metrics. */
export function combineBaselines(bs: BaselineLike[]): BaselineLike | null {
  if (!bs.length) return null;
  const count = bs.reduce((s, b) => s + b.reviewCount, 0);
  const w = (f: (b: BaselineLike) => number) => (count ? bs.reduce((s, b) => s + f(b) * b.reviewCount, 0) / count : 0);
  const withHours = bs.filter((b) => b.avgResponseHours != null);
  return {
    rating: w((b) => b.rating),
    reviewCount: count,
    velocityPerWeek: bs.reduce((s, b) => s + b.velocityPerWeek, 0),
    responseRate: w((b) => b.responseRate),
    avgResponseHours: withHours.length ? withHours.reduce((s, b) => s + b.avgResponseHours!, 0) / withHours.length : null,
  };
}

/**
 * Estimated reviews driven by stands: each stand "Leave a Google review" click can explain at most one
 * review at the same location created within `windowMs` after it (greedy, oldest first). Reviews already
 * attributed to an e-mail/SMS request are excluded by the caller.
 */
export function matchClicksToReviews(
  clicks: { id: string; locationId: string; at: Date; standId?: string | null }[],
  reviews: { id: string; locationId: string; at: Date }[],
  windowMs = 24 * HOUR,
): Map<string, string> {
  const matches = new Map<string, string>(); // reviewId -> clickId
  const byLoc = new Map<string, typeof clicks>();
  for (const c of [...clicks].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    byLoc.set(c.locationId, [...(byLoc.get(c.locationId) ?? []), c]);
  }
  const used = new Set<string>();
  for (const r of [...reviews].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const candidates = byLoc.get(r.locationId) ?? [];
    // latest unused click before the review, within the window
    let best: (typeof clicks)[number] | undefined;
    for (const c of candidates) {
      if (used.has(c.id)) continue;
      const dt = r.at.getTime() - c.at.getTime();
      if (dt < 0) break;
      if (dt <= windowMs) best = c;
    }
    if (best) {
      used.add(best.id);
      matches.set(r.id, best.id);
    }
  }
  return matches;
}

export { WEEK };
