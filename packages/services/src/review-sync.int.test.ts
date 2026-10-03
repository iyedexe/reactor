import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MockGoogleBusinessAdapter } from "@avis/adapters/google/mock";
import { forTenant } from "@avis/db";
import { systemDb, disconnectPrisma } from "@avis/db/system";
import { resetDatabase } from "@avis/db/testing";
import { syncLocationReviews } from "./review-sync.ts";

const google = new MockGoogleBusinessAdapter();
const db = () => systemDb();
let orgId: string;
let locationId: string;
const GBP = { accountId: "accounts/1", gbpLocationId: "locations/sync-test" };

async function addGoogleReview(id: string, stars: number, minutesAgo: number, extra: Partial<{ comment: string; replyComment: string }> = {}) {
  const t = new Date(Date.now() - minutesAgo * 60_000);
  await db().mockGbpReview.create({
    data: {
      gbpLocationId: GBP.gbpLocationId,
      reviewId: id,
      reviewerName: `Client ${id}`,
      starRating: stars,
      comment: extra.comment ?? `Avis ${id}`,
      createTime: t,
      updateTime: t,
      replyComment: extra.replyComment,
      replyUpdateTime: extra.replyComment ? t : undefined,
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  orgId = "org_sync";
  await db().organization.create({ data: { id: orgId, name: "Sync", slug: "sync" } });
  const loc = await db().location.create({
    data: { organizationId: orgId, name: "Bistro", category: "restaurant", gbpAccountId: GBP.accountId, gbpLocationId: GBP.gbpLocationId },
  });
  locationId = loc.id;
});

afterAll(() => disconnectPrisma());

describe("review sync", () => {
  it("imports all reviews on first sync and stores Google totals", async () => {
    for (let i = 0; i < 120; i++) await addGoogleReview(`r${i}`, (i % 5) + 1, i * 60);
    const res = await syncLocationReviews(google, orgId, locationId);
    expect(res.created).toHaveLength(120);
    expect(res.fullScan).toBe(true);
    const loc = await db().location.findUniqueOrThrow({ where: { id: locationId } });
    expect(loc.googleReviewCount).toBe(120);
    expect(loc.googleRating).toBe(3);
  });

  it("is idempotent", async () => {
    for (let i = 0; i < 10; i++) await addGoogleReview(`r${i}`, 5, i * 60);
    await syncLocationReviews(google, orgId, locationId);
    const again = await syncLocationReviews(google, orgId, locationId);
    expect(again.created).toHaveLength(0);
    expect(again.updated).toBe(0);
    expect(await db().review.count()).toBe(10);
  });

  it("incremental sync picks up only new and edited reviews", async () => {
    for (let i = 0; i < 60; i++) await addGoogleReview(`old${i}`, 4, 60 * 24 * 10 + i);
    await syncLocationReviews(google, orgId, locationId);
    await addGoogleReview("new1", 2, 0);
    await db().mockGbpReview.update({ where: { reviewId: "old3" }, data: { starRating: 5, comment: "Finalement top", updateTime: new Date() } });
    const res = await syncLocationReviews(google, orgId, locationId);
    expect(res.fullScan).toBe(false);
    expect(res.created).toHaveLength(1);
    expect(res.updated).toBe(1);
    expect(res.fetched).toBeLessThan(10); // stopped early instead of re-reading everything
    const edited = await db().review.findFirstOrThrow({ where: { googleReviewId: "old3" } });
    expect(edited.rating).toBe(5);
  });

  it("detects deleted reviews and closes their violation reports", async () => {
    await addGoogleReview("keep", 5, 10);
    await addGoogleReview("spam", 1, 20, { comment: "Promo sur www.example.com" });
    await syncLocationReviews(google, orgId, locationId);
    const spam = await db().review.findFirstOrThrow({ where: { googleReviewId: "spam" } });
    await db().violationReport.create({
      data: { organizationId: orgId, reviewId: spam.id, category: "SPAM_FAKE", reasonText: "Spam", explanation: "lien", status: "SUBMITTED" },
    });
    await db().mockGbpReview.update({ where: { reviewId: "spam" }, data: { deleted: true } });

    const res = await syncLocationReviews(google, orgId, locationId); // total dropped → full scan
    expect(res.fullScan).toBe(true);
    expect(res.removed).toEqual([spam.id]);
    const report = await db().violationReport.findUniqueOrThrow({ where: { reviewId: spam.id } });
    expect(report.status).toBe("REMOVED");
  });

  it("imports replies written outside AvisBoost, once", async () => {
    await addGoogleReview("r1", 5, 120, { replyComment: "Merci !" });
    await syncLocationReviews(google, orgId, locationId);
    await syncLocationReviews(google, orgId, locationId, { full: true });
    const replies = await db().reviewReply.findMany();
    expect(replies).toHaveLength(1);
    expect(replies[0]!.origin).toBe("EXTERNAL");
    const review = await db().review.findFirstOrThrow();
    expect(review.replyState).toBe("ANSWERED");
    expect(review.firstRepliedAt).not.toBeNull();
  });

  it("skips suspended organizations and unconnected locations", async () => {
    await addGoogleReview("r1", 5, 1);
    await db().organization.update({ where: { id: orgId }, data: { serviceState: "SUSPENDED" } });
    expect((await syncLocationReviews(google, orgId, locationId)).skipped).toBe("service_suspended");
    await db().organization.update({ where: { id: orgId }, data: { serviceState: "ACTIVE" } });
    const other = await db().location.create({ data: { organizationId: orgId, name: "No GBP", category: "restaurant" } });
    expect((await syncLocationReviews(google, orgId, other.id)).skipped).toBe("not_connected");
  });

  it("records sync errors", async () => {
    const failing = { ...google, mode: "mock" as const, listReviews: async () => { throw new Error("quota exceeded"); } };
    await expect(syncLocationReviews(failing as never, orgId, locationId)).rejects.toThrow("quota");
    const state = await forTenant({ organizationId: orgId }).reviewSyncState.findUniqueOrThrow({ where: { locationId } });
    expect(state.lastError).toContain("quota exceeded");
  });
});
