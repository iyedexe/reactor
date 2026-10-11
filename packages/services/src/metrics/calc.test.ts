import { describe, expect, it } from "vitest";
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
} from "./calc.ts";
import { bucketStart, resolvePeriod } from "./period.ts";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
function row(locationId: string, date: string, p: Partial<DailyRow> = {}): DailyRow {
  return {
    locationId,
    date: d(date),
    rating: 4,
    totalReviews: 10,
    newReviews: 0,
    ratingSum: 0,
    repliedReviews: 0,
    responseHoursSum: 0,
    scans: 0,
    googleClicks: 0,
    feedbacks: 0,
    messagesSent: 0,
    messageClicks: 0,
    attributedReviews: 0,
    ...p,
  };
}

describe("period", () => {
  it("resolves fixed windows with a same-length previous window", () => {
    const p = resolvePeriod("30j", new Date("2026-10-11T10:00:00Z"));
    expect(p.to.toISOString().slice(0, 10)).toBe("2026-10-11");
    expect(p.from.toISOString().slice(0, 10)).toBe("2026-09-12");
    expect(p.prevTo.toISOString().slice(0, 10)).toBe("2026-09-11");
    expect(p.prevFrom.toISOString().slice(0, 10)).toBe("2026-08-13");
    expect(p.granularity).toBe("day");
    expect(resolvePeriod("90j").granularity).toBe("week");
    expect(resolvePeriod("12m").granularity).toBe("month");
  });

  it("uses the Paris day near midnight", () => {
    // 23:30 UTC on Oct 11 is already Oct 12 in Paris
    expect(resolvePeriod("30j", new Date("2026-10-11T23:30:00Z")).to.toISOString().slice(0, 10)).toBe("2026-10-12");
  });

  it("weeks start on Monday", () => {
    expect(bucketStart(d("2026-10-11"), "week").toISOString().slice(0, 10)).toBe("2026-10-05"); // Sunday → Monday before
    expect(bucketStart(d("2026-10-12"), "week").toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(bucketStart(d("2026-10-11"), "month").toISOString().slice(0, 10)).toBe("2026-10-01");
  });
});

describe("response metrics", () => {
  const rows = [
    row("a", "2026-10-01", { newReviews: 4, repliedReviews: 3, responseHoursSum: 30 }),
    row("b", "2026-10-02", { newReviews: 6, repliedReviews: 6, responseHoursSum: 12 }),
  ];
  it("response rate = replied / received", () => expect(responseRate(sumRows(rows))).toBe(0.9));
  it("average response time = hours / replied", () => expect(avgResponseHours(sumRows(rows))).toBeCloseTo(42 / 9));
  it("nulls when nothing to measure", () => {
    expect(responseRate(sumRows([]))).toBeNull();
    expect(avgResponseHours(sumRows([]))).toBeNull();
  });
  it("sumRows honours the date range", () => {
    expect(sumRows(rows, d("2026-10-02"), d("2026-10-31")).newReviews).toBe(6);
  });
});

describe("velocity and trends", () => {
  it("reviews per week", () => {
    expect(velocity(12, 84)).toBe(1);
    expect(velocity(0, 0)).toBe(0);
  });
  it("trend computes delta and relative change", () => {
    expect(trend(12, 10)).toEqual({ value: 12, previous: 10, delta: 2, pct: 0.2 });
    expect(trend(3, 0).pct).toBeNull();
    expect(trend(null, 2).delta).toBeNull();
  });
});

describe("multi-location aggregation", () => {
  it("weights the rating by each location's review count", () => {
    const rows = [row("a", "2026-10-01", { rating: 5, totalReviews: 30 }), row("b", "2026-10-01", { rating: 3, totalReviews: 10 })];
    const s = snapshotAt(rows, d("2026-10-05"));
    expect(s.totalReviews).toBe(40);
    expect(s.rating).toBeCloseTo(4.5);
  });

  it("uses each location's latest row on or before the date", () => {
    const rows = [row("a", "2026-10-01", { totalReviews: 10 }), row("a", "2026-10-03", { totalReviews: 12 }), row("a", "2026-10-09", { totalReviews: 20 })];
    expect(snapshotAt(rows, d("2026-10-05")).totalReviews).toBe(12);
  });

  it("combines baselines (sum of counts and velocity, weighted rating)", () => {
    const b = combineBaselines([
      { rating: 4, reviewCount: 100, velocityPerWeek: 1, responseRate: 0.2, avgResponseHours: 48 },
      { rating: 5, reviewCount: 100, velocityPerWeek: 0.5, responseRate: 0.4, avgResponseHours: null },
    ])!;
    expect(b.rating).toBe(4.5);
    expect(b.reviewCount).toBe(200);
    expect(b.velocityPerWeek).toBe(1.5);
    expect(b.responseRate).toBeCloseTo(0.3);
    expect(b.avgResponseHours).toBe(48);
    expect(combineBaselines([])).toBeNull();
  });
});

describe("series", () => {
  it("buckets by week with cumulative totals at bucket end", () => {
    const rows = [
      row("a", "2026-10-05", { newReviews: 2, ratingSum: 9, totalReviews: 12 }),
      row("a", "2026-10-07", { newReviews: 1, ratingSum: 5, totalReviews: 13 }),
      row("a", "2026-10-12", { newReviews: 3, ratingSum: 12, totalReviews: 16, rating: 4.1 }),
    ];
    const s = buildSeries(rows, d("2026-10-05"), d("2026-10-18"), "week");
    expect(s.map((p) => p.date)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(s[0]).toMatchObject({ newReviews: 3, totalReviews: 13 });
    expect(s[0]!.avgStars).toBeCloseTo(14 / 3);
    expect(s[1]).toMatchObject({ newReviews: 3, totalReviews: 16, rating: 4.1 });
  });
});

describe("stand attribution", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
  it("each click explains at most one review, within 24h, same location", () => {
    const m = matchClicksToReviews(
      [
        { id: "c1", locationId: "a", at: t(10) },
        { id: "c2", locationId: "b", at: t(10) },
      ],
      [
        { id: "r1", locationId: "a", at: t(11) },
        { id: "r2", locationId: "a", at: t(12) }, // no click left
        { id: "r3", locationId: "b", at: t(40) }, // too late
        { id: "r4", locationId: "a", at: t(9) }, // before the click
      ],
    );
    expect([...m.entries()]).toEqual([["r1", "c1"]]);
  });
});
