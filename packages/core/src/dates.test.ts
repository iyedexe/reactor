import { describe, expect, it } from "vitest";
import { dateKeyInTz, localDayRange, startOfLocalDay } from "./dates.ts";

describe("local days (Europe/Paris)", () => {
  it("start of day in winter and summer time", () => {
    expect(startOfLocalDay("2026-01-15").toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(startOfLocalDay("2026-07-15").toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });
  it("range across the DST change is 23 hours on the short day", () => {
    const r = localDayRange("2026-03-29", "2026-03-29");
    expect((r.lt.getTime() - r.gte.getTime()) / 3_600_000).toBe(23);
  });
  it("date key of an instant", () => {
    expect(dateKeyInTz(new Date("2026-10-11T22:30:00Z"))).toBe("2026-10-12");
  });
});
