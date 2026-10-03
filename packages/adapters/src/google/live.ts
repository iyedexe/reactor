import { GoogleNotConfiguredError, type GbpLocation, type GbpReview, type GbpReviewPage, type GoogleBusinessAdapter, type StarRating } from "./types.ts";

const STARS: Record<string, StarRating> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

interface LiveConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

/**
 * Real Google Business Profile adapter (reviews API v4 + Business Information API v1), using an OAuth
 * refresh token of the Google account that manages the clients' profiles (as manager).
 * Only enabled with GOOGLE_MODE=live once API access has been approved.
 */
export class LiveGoogleBusinessAdapter implements GoogleBusinessAdapter {
  readonly mode = "live" as const;
  private token?: { value: string; expiresAt: number };

  constructor(private readonly cfg: LiveConfig) {}

  private async accessToken(): Promise<string> {
    const { clientId, clientSecret, refreshToken } = this.cfg;
    if (!clientId || !clientSecret || !refreshToken) throw new GoogleNotConfiguredError("Google Business Profile");
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    if (!res.ok) throw new Error(`Google OAuth refresh failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${await this.accessToken()}`, "content-type": "application/json", ...init.headers },
    });
    if (!res.ok) throw new Error(`Google API ${init.method ?? "GET"} ${url} failed: ${res.status} ${await res.text()}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async listLocations(accountId: string): Promise<GbpLocation[]> {
    const out: GbpLocation[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations`);
      url.searchParams.set("readMask", "name,title,metadata");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const json = await this.call<{ locations?: { name: string; title: string; metadata?: { placeId?: string } }[]; nextPageToken?: string }>(
        url.toString(),
      );
      for (const l of json.locations ?? []) out.push({ gbpLocationId: l.name, accountId, title: l.title, placeId: l.metadata?.placeId });
      pageToken = json.nextPageToken;
    } while (pageToken);
    return out;
  }

  async listReviews(loc: { accountId: string; gbpLocationId: string }, opts: { pageToken?: string; pageSize?: number } = {}): Promise<GbpReviewPage> {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${loc.accountId}/${loc.gbpLocationId}/reviews`);
    url.searchParams.set("pageSize", String(Math.min(opts.pageSize ?? 50, 50)));
    url.searchParams.set("orderBy", "updateTime desc");
    if (opts.pageToken) url.searchParams.set("pageToken", opts.pageToken);
    const json = await this.call<{
      reviews?: {
        reviewId: string;
        reviewer: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
        starRating: string;
        comment?: string;
        createTime: string;
        updateTime: string;
        reviewReply?: { comment: string; updateTime: string };
      }[];
      averageRating?: number;
      totalReviewCount?: number;
      nextPageToken?: string;
    }>(url.toString());
    const reviews: GbpReview[] = (json.reviews ?? []).map((r) => ({
      reviewId: r.reviewId,
      reviewerName: r.reviewer.isAnonymous ? "Utilisateur Google" : (r.reviewer.displayName ?? "Utilisateur Google"),
      reviewerPhotoUrl: r.reviewer.profilePhotoUrl,
      starRating: STARS[r.starRating] ?? 3,
      comment: r.comment,
      createTime: new Date(r.createTime),
      updateTime: new Date(r.updateTime),
      reply: r.reviewReply ? { comment: r.reviewReply.comment, updateTime: new Date(r.reviewReply.updateTime) } : undefined,
    }));
    return { reviews, nextPageToken: json.nextPageToken, averageRating: json.averageRating ?? 0, totalReviewCount: json.totalReviewCount ?? 0 };
  }

  async upsertReply(loc: { accountId: string; gbpLocationId: string }, reviewId: string, comment: string): Promise<{ updateTime: Date }> {
    const json = await this.call<{ updateTime: string }>(
      `https://mybusiness.googleapis.com/v4/${loc.accountId}/${loc.gbpLocationId}/reviews/${reviewId}/reply`,
      { method: "PUT", body: JSON.stringify({ comment }) },
    );
    return { updateTime: new Date(json.updateTime) };
  }

  async deleteReply(loc: { accountId: string; gbpLocationId: string }, reviewId: string): Promise<void> {
    await this.call(`https://mybusiness.googleapis.com/v4/${loc.accountId}/${loc.gbpLocationId}/reviews/${reviewId}/reply`, { method: "DELETE" });
  }
}
