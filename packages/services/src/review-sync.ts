import type { GbpReview, GoogleBusinessAdapter } from "@avis/adapters";
import { forTenant, type TenantDb } from "@avis/db";
import { HOUR } from "@avis/core/dates";

export interface SyncResult {
  locationId: string;
  skipped?: "not_connected" | "service_suspended";
  fetched: number;
  created: string[]; // review ids that are new (to be processed: classification, reply, alert)
  updated: number;
  repliesImported: number;
  removed: string[]; // review ids no longer on Google
  fullScan: boolean;
}

export interface SyncOptions {
  /** Walk every page and detect deleted reviews. Done nightly and whenever Google's total drops. */
  full?: boolean;
  now?: Date;
}

/** Overlap with the previous sync, so reviews updated while a sync was running are not missed. */
const INCREMENTAL_OVERLAP = HOUR;

/**
 * Pulls reviews for one location and reconciles them with our table. Idempotent: running it twice in a
 * row creates nothing new. Writes go through the tenant-scoped client.
 */
export async function syncLocationReviews(
  google: GoogleBusinessAdapter,
  organizationId: string,
  locationId: string,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const db = forTenant({ organizationId });
  const now = opts.now ?? new Date();
  const result: SyncResult = { locationId, fetched: 0, created: [], updated: 0, repliesImported: 0, removed: [], fullScan: false };

  const [org, location] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId } }),
    db.location.findUniqueOrThrow({ where: { id: locationId }, include: { syncState: true } }),
  ]);
  if (org.serviceState !== "ACTIVE") return { ...result, skipped: "service_suspended" };
  if (!location.gbpAccountId || !location.gbpLocationId) return { ...result, skipped: "not_connected" };
  const gbp = { accountId: location.gbpAccountId, gbpLocationId: location.gbpLocationId };

  const lastSuccess = location.syncState?.lastSuccessAt ?? null;
  let full = Boolean(opts.full) || !lastSuccess;
  const since = lastSuccess ? new Date(lastSuccess.getTime() - INCREMENTAL_OVERLAP) : null;

  try {
    const seen = new Set<string>();
    let pageToken: string | undefined;
    let totals: { averageRating: number; totalReviewCount: number } | undefined;

    for (;;) {
      const page = await google.listReviews(gbp, { pageToken, pageSize: 50 });
      if (!totals) {
        totals = { averageRating: page.averageRating, totalReviewCount: page.totalReviewCount };
        // A drop in Google's total means something was deleted: only a full scan can find what.
        if (!full) {
          const ours = await db.review.count({ where: { locationId, removedAt: null } });
          if (page.totalReviewCount < ours) full = true;
        }
      }
      let reachedKnown = false;
      for (const r of page.reviews) {
        result.fetched++;
        seen.add(r.reviewId);
        if (!full && since && r.updateTime < since) {
          reachedKnown = true;
          break;
        }
        await upsertReview(db, locationId, r, result);
      }
      if (reachedKnown || !page.nextPageToken) break;
      pageToken = page.nextPageToken;
    }

    if (full) {
      result.fullScan = true;
      const ours = await db.review.findMany({ where: { locationId, removedAt: null }, select: { id: true, googleReviewId: true } });
      const gone = ours.filter((r) => !seen.has(r.googleReviewId)).map((r) => r.id);
      if (gone.length) {
        await db.review.updateMany({ where: { id: { in: gone } }, data: { removedAt: now } });
        // A reported review that disappears was (most likely) removed by Google following the report.
        await db.violationReport.updateMany({
          where: { reviewId: { in: gone }, status: { in: ["TO_SUBMIT", "SUBMITTED"] } },
          data: { status: "REMOVED", resolvedAt: now },
        });
      }
      result.removed = gone;
    }

    await db.location.update({
      where: { id: locationId },
      data: { googleRating: totals?.averageRating ?? null, googleReviewCount: totals?.totalReviewCount ?? null },
    });
    await db.reviewSyncState.upsert({
      where: { locationId },
      create: { organizationId, locationId, lastSyncedAt: now, lastSuccessAt: now, reviewsSeen: result.fetched },
      update: { lastSyncedAt: now, lastSuccessAt: now, lastError: null, reviewsSeen: result.fetched },
    });
    return result;
  } catch (err) {
    await db.reviewSyncState.upsert({
      where: { locationId },
      create: { organizationId, locationId, lastSyncedAt: now, lastError: String(err) },
      update: { lastSyncedAt: now, lastError: String(err) },
    });
    throw err;
  }
}

async function upsertReview(db: TenantDb, locationId: string, r: GbpReview, result: SyncResult): Promise<void> {
  const existing = await db.review.findUnique({
    where: { locationId_googleReviewId: { locationId, googleReviewId: r.reviewId } },
    include: { replies: { where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 1 } },
  });

  let reviewId: string;
  if (!existing) {
    const created = await db.review.create({
      data: {
        organizationId: db.organizationId,
        locationId,
        googleReviewId: r.reviewId,
        authorName: r.reviewerName,
        authorPhotoUrl: r.reviewerPhotoUrl,
        rating: r.starRating,
        comment: r.comment ?? null,
        createdAtGoogle: r.createTime,
        updatedAtGoogle: r.updateTime,
      },
    });
    reviewId = created.id;
    result.created.push(reviewId);
  } else {
    reviewId = existing.id;
    const changed =
      existing.updatedAtGoogle.getTime() !== r.updateTime.getTime() ||
      existing.rating !== r.starRating ||
      (existing.comment ?? null) !== (r.comment ?? null) ||
      existing.removedAt !== null;
    if (changed) {
      await db.review.update({
        where: { id: existing.id },
        data: { rating: r.starRating, comment: r.comment ?? null, updatedAtGoogle: r.updateTime, authorName: r.reviewerName, removedAt: null },
      });
      result.updated++;
    }
  }

  // Replies made outside AvisBoost (e.g. in Google Maps) are imported so response metrics stay right.
  const publishedHere = existing?.replies[0];
  if (r.reply && (!publishedHere || publishedHere.body.trim() !== r.reply.comment.trim())) {
    const pending = await db.reviewReply.findFirst({ where: { reviewId, status: { in: ["DRAFT", "PENDING_APPROVAL"] } } });
    if (pending) {
      await db.reviewReply.update({ where: { id: pending.id }, data: { status: "DISCARDED" } });
      await db.replyRevision.create({
        data: { organizationId: db.organizationId, replyId: pending.id, action: "DISCARDED", body: pending.body },
      });
    }
    const reply = await db.reviewReply.create({
      data: {
        organizationId: db.organizationId,
        reviewId,
        body: r.reply.comment,
        status: "PUBLISHED",
        origin: "EXTERNAL",
        publishedAt: r.reply.updateTime,
      },
    });
    await db.replyRevision.create({
      data: { organizationId: db.organizationId, replyId: reply.id, action: "SYNCED", body: r.reply.comment },
    });
    const review = await db.review.findUniqueOrThrow({ where: { id: reviewId } });
    await db.review.update({
      where: { id: reviewId },
      data: { replyState: "ANSWERED", firstRepliedAt: review.firstRepliedAt ?? r.reply.updateTime },
    });
    result.repliesImported++;
  }
}
