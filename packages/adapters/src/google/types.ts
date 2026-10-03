/** Google Business Profile, as AvisBoost needs it. Shapes follow the GBP v4 reviews API, simplified. */

export type StarRating = 1 | 2 | 3 | 4 | 5;

export interface GbpReview {
  reviewId: string;
  reviewerName: string;
  reviewerPhotoUrl?: string;
  starRating: StarRating;
  comment?: string;
  createTime: Date;
  updateTime: Date;
  reply?: { comment: string; updateTime: Date };
}

export interface GbpReviewPage {
  reviews: GbpReview[];
  nextPageToken?: string;
  averageRating: number;
  totalReviewCount: number;
}

export interface GbpLocation {
  gbpLocationId: string; // "locations/123"
  accountId: string; // "accounts/456"
  title: string;
  placeId?: string;
}

export interface GoogleBusinessAdapter {
  readonly mode: "mock" | "live";
  listLocations(accountId: string): Promise<GbpLocation[]>;
  /** Newest-updated first, like the real API with orderBy=updateTime desc. */
  listReviews(loc: { accountId: string; gbpLocationId: string }, opts?: { pageToken?: string; pageSize?: number }): Promise<GbpReviewPage>;
  upsertReply(loc: { accountId: string; gbpLocationId: string }, reviewId: string, comment: string): Promise<{ updateTime: Date }>;
  deleteReply(loc: { accountId: string; gbpLocationId: string }, reviewId: string): Promise<void>;
}

export class GoogleNotConfiguredError extends Error {
  constructor(what: string) {
    super(`${what} is not configured (set GOOGLE_MODE=mock or provide Google credentials)`);
  }
}
