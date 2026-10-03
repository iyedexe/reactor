import { systemDb } from "@avis/db/system";
import type { GbpLocation, GbpReview, GbpReviewPage, GoogleBusinessAdapter, StarRating } from "./types.ts";

/**
 * Mock Google Business Profile backed by the mock_gbp_* tables (filled by the seed and, optionally,
 * by the worker's mock review generator). Behaves like the real API: paging, newest-updated first,
 * replies stored on the review, deleted reviews disappear.
 */
export class MockGoogleBusinessAdapter implements GoogleBusinessAdapter {
  readonly mode = "mock" as const;

  async listLocations(accountId: string): Promise<GbpLocation[]> {
    const rows = await systemDb().mockGbpLocation.findMany({ where: { accountId } });
    return rows.map((r) => ({ gbpLocationId: r.gbpLocationId, accountId: r.accountId, title: r.title, placeId: r.placeId }));
  }

  async listReviews(loc: { gbpLocationId: string }, opts: { pageToken?: string; pageSize?: number } = {}): Promise<GbpReviewPage> {
    const db = systemDb();
    const pageSize = Math.min(opts.pageSize ?? 50, 50);
    const offset = opts.pageToken ? Number(opts.pageToken) : 0;
    const where = { gbpLocationId: loc.gbpLocationId, deleted: false };
    const [rows, agg] = await Promise.all([
      db.mockGbpReview.findMany({ where, orderBy: [{ updateTime: "desc" }, { reviewId: "asc" }], skip: offset, take: pageSize + 1 }),
      db.mockGbpReview.aggregate({ where, _avg: { starRating: true }, _count: true }),
    ]);
    const page = rows.slice(0, pageSize);
    return {
      reviews: page.map(toReview),
      nextPageToken: rows.length > pageSize ? String(offset + pageSize) : undefined,
      averageRating: Math.round((agg._avg.starRating ?? 0) * 10) / 10,
      totalReviewCount: agg._count,
    };
  }

  async upsertReply(loc: { gbpLocationId: string }, reviewId: string, comment: string): Promise<{ updateTime: Date }> {
    const now = new Date();
    const res = await systemDb().mockGbpReview.updateMany({
      where: { gbpLocationId: loc.gbpLocationId, reviewId, deleted: false },
      data: { replyComment: comment, replyUpdateTime: now },
    });
    if (res.count === 0) throw new Error(`Review ${reviewId} not found`);
    return { updateTime: now };
  }

  async deleteReply(loc: { gbpLocationId: string }, reviewId: string): Promise<void> {
    await systemDb().mockGbpReview.updateMany({
      where: { gbpLocationId: loc.gbpLocationId, reviewId },
      data: { replyComment: null, replyUpdateTime: null },
    });
  }
}

function toReview(r: {
  reviewId: string;
  reviewerName: string;
  reviewerPhoto: string | null;
  starRating: number;
  comment: string | null;
  createTime: Date;
  updateTime: Date;
  replyComment: string | null;
  replyUpdateTime: Date | null;
}): GbpReview {
  return {
    reviewId: r.reviewId,
    reviewerName: r.reviewerName,
    reviewerPhotoUrl: r.reviewerPhoto ?? undefined,
    starRating: r.starRating as StarRating,
    comment: r.comment ?? undefined,
    createTime: r.createTime,
    updateTime: r.updateTime,
    reply: r.replyComment && r.replyUpdateTime ? { comment: r.replyComment, updateTime: r.replyUpdateTime } : undefined,
  };
}
