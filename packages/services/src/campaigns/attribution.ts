import { forTenant } from "@avis/db";
import { systemDb } from "@avis/db/system";
import { DAY, HOUR } from "@avis/core/dates";

/**
 * Estimated conversion: which review came from which e-mail/SMS request. Google never says, so:
 *  - NAME_MATCH: the review's display name matches the contact (first name + last name or its initial),
 *    and the request was sent in the 14 days before the review;
 *  - TIME_WINDOW: otherwise, a request clicked in the 24 hours before the review at the same location.
 * Each request explains at most one review and vice versa.
 */

export const ATTRIBUTION_WINDOW_DAYS = 14;

export function normalizeName(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

export function nameMatches(display: string, firstName: string, lastName: string | null): boolean {
  const d = normalizeName(display);
  const f = normalizeName(firstName);
  if (!d.length || !f.length || d[0] !== f[0]) return false;
  const l = lastName ? normalizeName(lastName) : [];
  const rest = d.slice(1);
  if (!rest.length) return true; // "Marie" vs Marie Dupont: first name only
  if (!l.length) return false;
  const last = rest.join(" ");
  return last === l.join(" ") || (rest.length === 1 && rest[0]!.length === 1 && rest[0] === l[0]![0]);
}

export interface Candidate {
  id: string;
  firstName: string;
  lastName: string | null;
  sentAt: Date;
  clickedAt: Date | null;
}

export function matchReview(review: { authorName: string; createdAt: Date }, candidates: Candidate[]): { requestId: string; method: "NAME_MATCH" | "TIME_WINDOW" } | null {
  const t = review.createdAt.getTime();
  const inWindow = candidates.filter((c) => c.sentAt.getTime() <= t && t - c.sentAt.getTime() <= ATTRIBUTION_WINDOW_DAYS * DAY);
  const byRecency = (a: Candidate, b: Candidate) => (b.clickedAt ?? b.sentAt).getTime() - (a.clickedAt ?? a.sentAt).getTime();
  const named = inWindow.filter((c) => nameMatches(review.authorName, c.firstName, c.lastName)).sort(byRecency);
  if (named[0]) return { requestId: named[0].id, method: "NAME_MATCH" };
  const clicked = inWindow.filter((c) => c.clickedAt && c.clickedAt.getTime() <= t && t - c.clickedAt.getTime() <= 24 * HOUR).sort(byRecency);
  if (clicked[0]) return { requestId: clicked[0].id, method: "TIME_WINDOW" };
  return null;
}

export async function attributeReviews(organizationId: string, since: Date) {
  const db = forTenant({ organizationId });
  const reviews = await db.review.findMany({ where: { createdAtGoogle: { gte: since }, removedAt: null }, orderBy: { createdAtGoogle: "asc" }, select: { id: true, locationId: true, authorName: true, createdAtGoogle: true } });
  const already = new Set((await db.reviewRequest.findMany({ where: { attributedReviewId: { not: null } }, select: { attributedReviewId: true } })).map((r) => r.attributedReviewId));
  let matched = 0;
  for (const r of reviews) {
    if (already.has(r.id)) continue;
    const reqs = await db.reviewRequest.findMany({
      where: { locationId: r.locationId, attributedReviewId: null, sentAt: { gte: new Date(r.createdAtGoogle.getTime() - ATTRIBUTION_WINDOW_DAYS * DAY), lte: r.createdAtGoogle } },
      include: { contact: { select: { firstName: true, lastName: true } } },
    });
    const m = matchReview(
      { authorName: r.authorName, createdAt: r.createdAtGoogle },
      reqs.map((q) => ({ id: q.id, firstName: q.contact.firstName, lastName: q.contact.lastName, sentAt: q.sentAt!, clickedAt: q.clickedAt })),
    );
    if (!m) continue;
    await db.reviewRequest.update({ where: { id: m.requestId }, data: { attributedReviewId: r.id, attribution: m.method } });
    matched++;
  }
  return { reviews: reviews.length, matched };
}

/** Worker: hourly, over the last attribution window, for every active organization. */
export async function attributeAll(now = new Date()) {
  const orgs = await systemDb().organization.findMany({ where: { serviceState: { not: "TERMINATED" } }, select: { id: true } });
  let matched = 0;
  for (const o of orgs) matched += (await attributeReviews(o.id, new Date(now.getTime() - 2 * DAY))).matched;
  return { organizations: orgs.length, matched };
}
