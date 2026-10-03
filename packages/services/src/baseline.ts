import { forTenant } from "@avis/db";
import { DAY, WEEK } from "@avis/core/dates";

export const BASELINE_WEEKS = 12;

/**
 * Captures the "before" picture of a location at onboarding (first sync after signup).
 * Velocity is measured over the 12 weeks before `at`; response rate and time over the 12 months before.
 */
export async function captureBaseline(organizationId: string, locationId: string, at = new Date()) {
  const db = forTenant({ organizationId });
  const loc = await db.location.findUniqueOrThrow({ where: { id: locationId } });
  const reviews = await db.review.findMany({
    where: { locationId, removedAt: null, createdAtGoogle: { lt: at } },
    select: { rating: true, createdAtGoogle: true, firstRepliedAt: true },
  });

  const velocityFrom = new Date(at.getTime() - BASELINE_WEEKS * WEEK);
  const responseFrom = new Date(at.getTime() - 52 * WEEK);
  const recent = reviews.filter((r) => r.createdAtGoogle >= velocityFrom);
  const lastYear = reviews.filter((r) => r.createdAtGoogle >= responseFrom);
  const replied = lastYear.filter((r) => r.firstRepliedAt && r.firstRepliedAt <= at);
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  // Google's own totals are only meaningful when capturing "now" (normal onboarding); for a past date
  // (backfill, demo seed) we rebuild them from synced reviews.
  const isNow = Math.abs(Date.now() - at.getTime()) < DAY;
  const data = {
    capturedAt: at,
    rating: (isNow ? loc.googleRating : null) ?? Math.round(avgRating * 10) / 10,
    reviewCount: (isNow ? loc.googleReviewCount : null) ?? reviews.length,
    velocityPerWeek: Math.round((recent.length / BASELINE_WEEKS) * 100) / 100,
    responseRate: lastYear.length ? replied.length / lastYear.length : 0,
    avgResponseHours: replied.length
      ? replied.reduce((s, r) => s + (r.firstRepliedAt!.getTime() - r.createdAtGoogle.getTime()) / 3_600_000, 0) / replied.length
      : null,
  };
  return db.baselineSnapshot.upsert({
    where: { locationId },
    create: { organizationId, locationId, ...data },
    update: data,
  });
}
