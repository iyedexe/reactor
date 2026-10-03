import { systemDb } from "@avis/db/system";
import { Prisma } from "@avis/db";
import { addDays, dateFromKey, dateKeyInTz, DEFAULT_TZ } from "@avis/core/dates";

/**
 * Nightly rollup: one LocationDailyStat row per location and local day. Charts read only from these rows,
 * so the dashboard stays fast whatever the history size. Recomputing a range is idempotent.
 *
 * Removed reviews (no longer on Google) are excluded everywhere, matching what Google shows today.
 */

type DayRow = { day: string; n: number };

const localDay = (col: string, tz: string) =>
  Prisma.raw(`to_char((${col} AT TIME ZONE 'UTC') AT TIME ZONE '${tz.replace(/'/g, "")}', 'YYYY-MM-DD')`);

export async function rollupLocation(locationId: string, from: Date, to: Date): Promise<number> {
  const db = systemDb();
  const loc = await db.location.findUniqueOrThrow({ where: { id: locationId } });
  const tz = loc.timezone || DEFAULT_TZ;
  const fromKey = dateKeyInTz(from, tz);
  const toKey = dateKeyInTz(to, tz);
  const dayR = localDay(`r."createdAtGoogle"`, tz);

  const reviewsByDay = await db.$queryRaw<{ day: string; n: number; stars: number; replied: number; hours: number | null }[]>`
    SELECT ${dayR} AS day, count(*)::int AS n, sum(r.rating)::int AS stars,
           count(r."firstRepliedAt")::int AS replied,
           sum(EXTRACT(EPOCH FROM (r."firstRepliedAt" - r."createdAtGoogle")) / 3600)::float AS hours
    FROM review r
    WHERE r."locationId" = ${locationId} AND r."removedAt" IS NULL
    GROUP BY 1`;

  const eventsByDay = await db.$queryRaw<{ day: string; type: string; n: number }[]>`
    SELECT ${localDay(`e."occurredAt"`, tz)} AS day, e.type::text AS type, count(*)::int AS n
    FROM link_event e
    WHERE e."locationId" = ${locationId}
    GROUP BY 1, 2`;

  const sentByDay = await db.$queryRaw<DayRow[]>`
    SELECT ${localDay(`m."sentAt"`, tz)} AS day, count(*)::int AS n
    FROM message m JOIN review_request rr ON rr.id = m."reviewRequestId"
    WHERE rr."locationId" = ${locationId} AND m."sentAt" IS NOT NULL AND m.kind IN ('REQUEST', 'REMINDER')
    GROUP BY 1`;

  const attributedByDay = await db.$queryRaw<DayRow[]>`
    SELECT ${dayR} AS day, count(*)::int AS n
    FROM review_request rr JOIN review r ON r.id = rr."attributedReviewId"
    WHERE rr."locationId" = ${locationId} AND r."removedAt" IS NULL
    GROUP BY 1`;

  const reviews = new Map(reviewsByDay.map((r) => [r.day, r]));
  const events = new Map<string, Record<string, number>>();
  for (const e of eventsByDay) {
    const m = events.get(e.day) ?? {};
    m[e.type] = e.n;
    events.set(e.day, m);
  }
  const sent = new Map(sentByDay.map((r) => [r.day, r.n]));
  const attributed = new Map(attributedByDay.map((r) => [r.day, r.n]));

  // Cumulative totals start from everything before the range.
  let total = 0;
  let starSum = 0;
  for (const r of reviewsByDay) {
    if (r.day < fromKey) {
      total += r.n;
      starSum += r.stars;
    }
  }

  const rows: Prisma.LocationDailyStatCreateManyInput[] = [];
  for (let d = dateFromKey(fromKey); dateKeyInTz(d, "UTC") <= toKey; d = addDays(d, 1)) {
    const key = dateKeyInTz(d, "UTC");
    const r = reviews.get(key);
    total += r?.n ?? 0;
    starSum += r?.stars ?? 0;
    const ev = events.get(key) ?? {};
    rows.push({
      organizationId: loc.organizationId,
      locationId,
      date: d,
      totalReviews: total,
      rating: total ? Math.round((starSum / total) * 100) / 100 : null,
      newReviews: r?.n ?? 0,
      ratingSum: r?.stars ?? 0,
      repliedReviews: r?.replied ?? 0,
      responseHoursSum: r?.hours ?? 0,
      scans: ev.SCAN ?? 0,
      googleClicks: ev.GOOGLE_CLICK ?? 0,
      feedbacks: ev.FEEDBACK_SENT ?? 0,
      messageClicks: ev.MESSAGE_CLICK ?? 0,
      messagesSent: sent.get(key) ?? 0,
      attributedReviews: attributed.get(key) ?? 0,
    });
  }

  // Today's rating comes from Google itself when known (it may round differently from our average).
  const todayKey = dateKeyInTz(new Date(), tz);
  const last = rows[rows.length - 1];
  if (last && dateKeyInTz(last.date as Date, "UTC") === todayKey && loc.googleRating) last.rating = loc.googleRating;

  await db.$transaction([
    db.locationDailyStat.deleteMany({ where: { locationId, date: { gte: dateFromKey(fromKey), lte: dateFromKey(toKey) } } }),
    db.locationDailyStat.createMany({ data: rows }),
  ]);
  return rows.length;
}

/** Recomputes the last `days` days for every active location (nightly job). */
export async function rollupAll(days = 3, now = new Date()): Promise<number> {
  const locs = await systemDb().location.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  let n = 0;
  for (const l of locs) n += await rollupLocation(l.id, addDays(now, -days), now);
  return n;
}
