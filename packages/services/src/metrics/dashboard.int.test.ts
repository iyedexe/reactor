import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forTenant } from "@avis/db";
import { disconnectPrisma, systemDb } from "@avis/db/system";
import { resetDatabase } from "@avis/db/testing";
import { rollupLocation } from "../rollup.ts";
import { getDashboard } from "./dashboard.ts";

/** End-to-end metric check on a tiny, hand-computable dataset (two locations + another tenant). */
const NOW = new Date("2026-10-11T12:00:00Z");
const day = (n: number, h = 12) => new Date(Date.UTC(2026, 9, 11 - n, h)); // n days before NOW
const db = () => systemDb();
let A: string, B: string;

async function review(organizationId: string, locationId: string, id: string, rating: number, at: Date, repliedAfterH?: number) {
  return db().review.create({
    data: {
      organizationId,
      locationId,
      googleReviewId: id,
      authorName: "X",
      rating,
      createdAtGoogle: at,
      updatedAtGoogle: at,
      firstRepliedAt: repliedAfterH != null ? new Date(at.getTime() + repliedAfterH * 3_600_000) : null,
      replyState: repliedAfterH != null ? "ANSWERED" : "UNANSWERED",
      topics: rating >= 4 ? ["service"] : ["waiting_time"],
    },
  });
}

beforeAll(async () => {
  await resetDatabase();
  await db().organization.create({ data: { id: "org_m", name: "M", slug: "m", onboardedAt: day(20) } });
  await db().organization.create({ data: { id: "org_other", name: "O", slug: "o" } });
  A = (await db().location.create({ data: { organizationId: "org_m", name: "A", category: "restaurant", googleRating: 4.5, googleReviewCount: 4 } })).id;
  B = (await db().location.create({ data: { organizationId: "org_m", name: "B", category: "restaurant", googleRating: 3, googleReviewCount: 2 } })).id;
  const other = (await db().location.create({ data: { organizationId: "org_other", name: "O", category: "restaurant" } })).id;

  // Before the 30-day window (previous period)
  await review("org_m", A, "a0", 4, day(40), 48);
  // In the window
  await review("org_m", A, "a1", 5, day(10), 2);
  await review("org_m", A, "a2", 5, day(5), 4);
  await review("org_m", A, "a3", 4, day(2));
  await review("org_m", B, "b1", 2, day(3), 10);
  await review("org_m", B, "b2", 4, day(1));
  // Another tenant's review must never count
  await review("org_other", other, "o1", 1, day(3), 1);

  // A stand click 1h before a2 → estimated stand review
  const stand = await db().stand.create({ data: { code: "st1", organizationId: "org_m", locationId: A, status: "ACTIVE", label: "Comptoir" } });
  await db().linkEvent.createMany({
    data: [
      { organizationId: "org_m", locationId: A, standId: stand.id, type: "SCAN", occurredAt: new Date(day(5).getTime() - 3_600_000) },
      { organizationId: "org_m", locationId: A, standId: stand.id, type: "GOOGLE_CLICK", occurredAt: new Date(day(5).getTime() - 3_590_000) },
      { organizationId: "org_m", locationId: A, standId: stand.id, type: "SCAN", occurredAt: day(4) },
    ],
  });
  await db().baselineSnapshot.createMany({
    data: [
      { organizationId: "org_m", locationId: A, capturedAt: day(20), rating: 4, reviewCount: 1, velocityPerWeek: 0.1, responseRate: 1, avgResponseHours: 48 },
      { organizationId: "org_m", locationId: B, capturedAt: day(20), rating: 3, reviewCount: 1, velocityPerWeek: 0, responseRate: 0, avgResponseHours: null },
    ],
  });
  for (const l of [A, B, other]) await rollupLocation(l, day(80), NOW);
});

afterAll(() => disconnectPrisma());

describe("dashboard metrics (30 days)", () => {
  it("aggregates all locations of the tenant only", async () => {
    const d = await getDashboard(forTenant({ organizationId: "org_m" }), { period: "30j", now: NOW });
    expect(d.kpis.reviewsInPeriod.value).toBe(5);
    expect(d.kpis.reviewsInPeriod.previous).toBe(1);
    expect(d.kpis.totalReviews.value).toBe(6); // from Google totals (4 + 2)
    expect(d.kpis.rating.value).toBe(4); // (4.5×4 + 3×2) / 6
    expect(d.kpis.responseRate.value).toBeCloseTo(3 / 5);
    expect(d.kpis.avgResponseHours.value).toBeCloseTo((2 + 4 + 10) / 3);
    expect(d.distribution).toEqual([
      { stars: 5, count: 2 },
      { stars: 4, count: 2 },
      { stars: 3, count: 0 },
      { stars: 2, count: 1 },
      { stars: 1, count: 0 },
    ]);
    expect(d.topics.find((t) => t.topic === "service")).toMatchObject({ positive: 4, negative: 0 });
    expect(d.topics.find((t) => t.topic === "waiting_time")).toMatchObject({ negative: 1 });
    expect(d.funnels.stands).toMatchObject({ scans: 2, googleClicks: 1, estimatedReviews: 1 });
    expect(d.byStand[0]).toMatchObject({ label: "Comptoir", scans: 2, estimatedReviews: 1 });
    expect(d.impact?.before.reviewCount).toBe(2);
    expect(d.impact?.now.reviewCount).toBe(6);
    expect(d.series).toHaveLength(30);
    expect(d.series.reduce((s, p) => s + p.newReviews, 0)).toBe(5);
  });

  it("no trend when the previous window has no data", async () => {
    const d = await getDashboard(forTenant({ organizationId: "org_m" }), { period: "12m", now: NOW });
    expect(d.kpis.reviewsInPeriod.previous).toBeNull();
    expect(d.kpis.reviewsInPeriod.pct).toBeNull();
    expect(d.kpis.responseRate.delta).toBeNull();
  });

  it("filters to one location", async () => {
    const d = await getDashboard(forTenant({ organizationId: "org_m" }), { period: "30j", now: NOW, locationId: B });
    expect(d.kpis.reviewsInPeriod.value).toBe(2);
    expect(d.kpis.rating.value).toBe(3);
    expect(d.byStand).toHaveLength(0);
    expect(d.locations).toHaveLength(2); // the switcher still lists every location
  });

  it("a location id from another tenant yields nothing", async () => {
    const otherLoc = await db().location.findFirstOrThrow({ where: { organizationId: "org_other" } });
    const d = await getDashboard(forTenant({ organizationId: "org_m" }), { period: "30j", now: NOW, locationId: otherLoc.id });
    expect(d.kpis.reviewsInPeriod.value).toBe(0);
    expect(d.kpis.totalReviews.value).toBe(0);
  });
});
