import type { TenantDb } from "@avis/db";
import { addDays, DAY, dateFromKey, dateKeyInTz, DEFAULT_TZ, localDayRange } from "@avis/core/dates";
import { TOPICS, type Topic } from "@avis/core/topics";
import {
  avgResponseHours,
  buildSeries,
  combineBaselines,
  matchClicksToReviews,
  responseRate,
  snapshotAt,
  sumRows,
  trend,
  velocity,
  type DailyRow,
  type SeriesPoint,
  type Trend,
} from "./calc.ts";
import { resolvePeriod, type Granularity, type PeriodKey } from "./period.ts";

/**
 * Everything the client dashboard (and the monthly report) shows, for one location or all of them.
 * All reads go through the tenant-scoped client. The result is plain JSON (dates as ISO strings).
 */

export interface DashboardQuery {
  locationId?: string | null; // null/undefined = all locations
  period: PeriodKey;
  now?: Date;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const key = (d: Date) => iso(d);

export async function getDashboard(db: TenantDb, q: DashboardQuery) {
  const now = q.now ?? new Date();
  const [org, allLocations] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: db.organizationId } }),
    db.location.findMany({
      where: { status: "ACTIVE" },
      include: { baseline: true, syncState: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const locations = q.locationId ? allLocations.filter((l) => l.id === q.locationId) : allLocations;
  const locationIds = locations.map((l) => l.id);
  const tz = locations[0]?.timezone ?? DEFAULT_TZ;

  const first = await db.locationDailyStat.findFirst({ where: { locationId: { in: locationIds } }, orderBy: { date: "asc" }, select: { date: true } });
  const period = resolvePeriod(q.period, now, first?.date, tz);
  const joinedAt = org.onboardedAt ?? allLocations[0]?.createdAt ?? now;
  const joinedDay = dateFromKey(dateKeyInTz(joinedAt, tz));
  const today = period.to;
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const prevMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const prevMonthSameDay = addDays(prevMonthStart, today.getUTCDate() - 1);

  const earliestNeeded = new Date(Math.min(period.prevFrom.getTime(), addDays(joinedDay, -1).getTime(), addDays(prevMonthStart, -1).getTime()));
  const rows: DailyRow[] = locationIds.length
    ? await db.locationDailyStat.findMany({ where: { locationId: { in: locationIds }, date: { gte: earliestNeeded } }, orderBy: { date: "asc" } })
    : [];

  const range = localDayRange(key(period.from), key(period.to), tz);
  const cur = sumRows(rows, period.from, period.to);
  // Only compare with the previous window when we have data for all of it (otherwise trends are meaningless).
  const hasPrev = !!first && first.date.getTime() <= period.prevFrom.getTime();
  const prev = sumRows(rows, period.prevFrom, period.prevTo);

  // ── KPIs ────────────────────────────────────────────────────────────
  const liveCount = locations.reduce((s, l) => s + (l.googleReviewCount ?? 0), 0);
  const liveRating = liveCount ? locations.reduce((s, l) => s + (l.googleRating ?? 0) * (l.googleReviewCount ?? 0), 0) / liveCount : null;
  const atStart = snapshotAt(rows, addDays(period.from, -1));
  const monthNow = sumRows(rows, monthStart, today).newReviews;
  const monthPrev = sumRows(rows, prevMonthStart, prevMonthSameDay).newReviews;

  const kpis = {
    rating: trend(liveRating, hasPrev ? atStart.rating : null),
    totalReviews: trend(liveCount, atStart.totalReviews || null),
    reviewsThisMonth: trend(monthNow, monthPrev),
    reviewsInPeriod: trend(cur.newReviews, hasPrev ? prev.newReviews : null),
    responseRate: trend(responseRate(cur), hasPrev ? responseRate(prev) : null),
    avgResponseHours: trend(avgResponseHours(cur), hasPrev ? avgResponseHours(prev) : null),
  };

  // ── Impact since joining ────────────────────────────────────────────
  const since = sumRows(rows, joinedDay, today);
  const daysSince = Math.max(1, Math.round((today.getTime() - joinedDay.getTime()) / DAY) + 1);
  const baseline = combineBaselines(locations.flatMap((l) => (l.baseline ? [l.baseline] : [])));
  const impact = baseline
    ? {
        joinedAt: joinedAt.toISOString(),
        before: baseline,
        now: {
          rating: liveRating,
          reviewCount: liveCount,
          velocityPerWeek: velocity(since.newReviews, daysSince),
          responseRate: responseRate(since),
          avgResponseHours: avgResponseHours(since),
        },
      }
    : null;

  // ── Series ──────────────────────────────────────────────────────────
  const series: SeriesPoint[] = buildSeries(rows, period.from, period.to, period.granularity);

  // ── Reviews in the period: distribution and topics ──────────────────
  const reviewWhere = { locationId: { in: locationIds }, removedAt: null, createdAtGoogle: range };
  const [byStars, topicRows] = await Promise.all([
    db.review.groupBy({ by: ["rating"], where: reviewWhere, _count: { _all: true } }),
    db.review.findMany({ where: { ...reviewWhere, NOT: { topics: { isEmpty: true } } }, select: { rating: true, topics: true } }),
  ]);
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: byStars.find((b) => b.rating === stars)?._count._all ?? 0 }));
  const topicTally = new Map<Topic, { positive: number; neutral: number; negative: number }>(TOPICS.map((t) => [t, { positive: 0, neutral: 0, negative: 0 }]));
  for (const r of topicRows) {
    for (const t of r.topics as Topic[]) {
      const tally = topicTally.get(t);
      if (!tally) continue;
      if (r.rating >= 4) tally.positive++;
      else if (r.rating === 3) tally.neutral++;
      else tally.negative++;
    }
  }
  const topics = [...topicTally.entries()]
    .map(([topic, c]) => ({ topic, ...c, total: c.positive + c.neutral + c.negative }))
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);

  // ── Funnels and attribution ─────────────────────────────────────────
  const [standClicks, periodReviews, attributed] = await Promise.all([
    db.linkEvent.findMany({
      where: { locationId: { in: locationIds }, type: "GOOGLE_CLICK", standId: { not: null }, occurredAt: { gte: addDays(range.gte, -1), lt: range.lt } },
      select: { id: true, locationId: true, standId: true, occurredAt: true },
    }),
    db.review.findMany({ where: reviewWhere, select: { id: true, locationId: true, createdAtGoogle: true } }),
    db.reviewRequest.findMany({ where: { locationId: { in: locationIds }, attributedReviewId: { not: null } }, select: { attributedReviewId: true } }),
  ]);
  const attributedIds = new Set(attributed.map((a) => a.attributedReviewId));
  const matches = matchClicksToReviews(
    standClicks.map((c) => ({ id: c.id, locationId: c.locationId, at: c.occurredAt, standId: c.standId })),
    periodReviews.filter((r) => !attributedIds.has(r.id)).map((r) => ({ id: r.id, locationId: r.locationId, at: r.createdAtGoogle })),
  );
  const clickStand = new Map(standClicks.map((c) => [c.id, c.standId]));
  const standReviews = new Map<string, number>();
  for (const clickId of matches.values()) {
    const s = clickStand.get(clickId);
    if (s) standReviews.set(s, (standReviews.get(s) ?? 0) + 1);
  }

  const reqPeriod = { locationId: { in: locationIds } };
  const [sentCount, deliveredCount, clickedCount] = await Promise.all([
    db.reviewRequest.count({ where: { ...reqPeriod, sentAt: range } }),
    db.message.count({ where: { reviewRequest: { locationId: { in: locationIds } }, kind: "REQUEST", status: "DELIVERED", sentAt: range } }),
    db.reviewRequest.count({ where: { ...reqPeriod, clickedAt: range } }),
  ]);

  const funnels = {
    stands: { scans: cur.scans, googleClicks: cur.googleClicks, estimatedReviews: matches.size, feedbacks: cur.feedbacks },
    messages: { sent: sentCount, delivered: deliveredCount, clicked: clickedCount, estimatedReviews: cur.attributedReviews },
  };

  // ── Per stand ───────────────────────────────────────────────────────
  const [stands, standEvents] = await Promise.all([
    db.stand.findMany({ where: { locationId: { in: locationIds } }, include: { location: { select: { name: true } } }, orderBy: { label: "asc" } }),
    db.linkEvent.groupBy({ by: ["standId", "type"], where: { locationId: { in: locationIds }, standId: { not: null }, occurredAt: range }, _count: { _all: true } }),
  ]);
  const ev = (standId: string, type: string) => standEvents.find((e) => e.standId === standId && e.type === type)?._count._all ?? 0;
  const byStand = stands.map((s) => {
    const scans = ev(s.id, "SCAN");
    const clicks = ev(s.id, "GOOGLE_CLICK");
    const reviews = standReviews.get(s.id) ?? 0;
    return {
      id: s.id,
      code: s.code,
      label: s.label ?? s.code,
      location: s.location?.name ?? "",
      status: s.status,
      scans,
      googleClicks: clicks,
      feedbacks: ev(s.id, "FEEDBACK_SENT"),
      estimatedReviews: reviews,
      conversion: scans ? reviews / scans : null,
    };
  });

  // ── Per campaign ────────────────────────────────────────────────────
  const [campaigns, sentBy, clickedBy, attributedBy] = await Promise.all([
    db.campaign.findMany({ where: { locationId: { in: locationIds } }, include: { location: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    db.reviewRequest.groupBy({ by: ["campaignId"], where: { ...reqPeriod, sentAt: range }, _count: { _all: true } }),
    db.reviewRequest.groupBy({ by: ["campaignId"], where: { ...reqPeriod, clickedAt: range }, _count: { _all: true } }),
    db.reviewRequest.groupBy({ by: ["campaignId"], where: { ...reqPeriod, attributedReviewId: { in: periodReviews.map((r) => r.id) } }, _count: { _all: true } }),
  ]);
  const cnt = (arr: { campaignId: string | null; _count: { _all: number } }[], id: string) => arr.find((x) => x.campaignId === id)?._count._all ?? 0;
  const byCampaign = campaigns.map((c) => {
    const sent = cnt(sentBy, c.id);
    const reviews = cnt(attributedBy, c.id);
    return {
      id: c.id,
      name: c.name,
      location: c.location.name,
      status: c.status,
      channels: c.channels,
      sent,
      clicked: cnt(clickedBy, c.id),
      estimatedReviews: reviews,
      conversion: sent ? reviews / sent : null,
    };
  });

  // ── Competitors ─────────────────────────────────────────────────────
  const competitors = await db.competitor.findMany({
    where: { locationId: { in: locationIds }, tracked: true },
    include: {
      location: { select: { name: true } },
      snapshots: { where: { date: { gte: addDays(period.from, -7), lte: period.to } }, orderBy: { date: "asc" } },
    },
    orderBy: { distanceM: "asc" },
  });
  const competitorRows = competitors.map((c) => {
    const firstSnap = c.snapshots[0];
    const lastSnap = c.snapshots[c.snapshots.length - 1];
    return {
      id: c.id,
      name: c.name,
      location: c.location.name,
      distanceM: c.distanceM,
      rating: lastSnap?.rating ?? null,
      ratingDelta: lastSnap && firstSnap ? lastSnap.rating - firstSnap.rating : null,
      reviewCount: lastSnap?.reviewCount ?? null,
      reviewDelta: lastSnap && firstSnap ? lastSnap.reviewCount - firstSnap.reviewCount : null,
      series: c.snapshots.map((s) => ({ date: iso(s.date), rating: s.rating, reviewCount: s.reviewCount })),
    };
  });
  const own = locations.map((l) => ({
    id: l.id,
    name: l.name,
    rating: l.googleRating,
    reviewCount: l.googleReviewCount,
    reviewDelta: (l.googleReviewCount ?? 0) - (snapshotAt(rows.filter((r) => r.locationId === l.id), addDays(period.from, -1)).totalReviews || 0),
  }));

  return {
    organization: { id: org.id, name: org.name, joinedAt: joinedAt.toISOString() },
    locations: allLocations.map((l) => ({ id: l.id, name: l.name })),
    selectedLocationId: q.locationId ?? null,
    period: { key: period.key, from: iso(period.from), to: iso(period.to), granularity: period.granularity as Granularity, days: period.days },
    sync: locations.map((l) => ({ id: l.id, name: l.name, lastSuccessAt: l.syncState?.lastSuccessAt?.toISOString() ?? null, lastError: l.syncState?.lastError ?? null })),
    kpis,
    impact,
    series,
    distribution,
    topics,
    funnels,
    byStand,
    byCampaign,
    competitors: { own, rows: competitorRows },
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
export type { Trend, SeriesPoint };
