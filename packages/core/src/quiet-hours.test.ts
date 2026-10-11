import { describe, expect, it } from "vitest";
import { easterSunday, frenchHolidays, isSendAllowed, nextAllowedSendTime } from "./quiet-hours.ts";

// Helper: a Paris wall-clock time as an instant (2026: CET until Mar 29, CEST until Oct 25).
const paris = (iso: string) => {
  const [date, time] = iso.split(" ");
  const month = Number(date!.slice(5, 7));
  const day = Number(date!.slice(8, 10));
  const summer = (month > 3 || (month === 3 && day >= 29)) && (month < 10 || (month === 10 && day < 25));
  return new Date(`${date}T${time}:00${summer ? "+02:00" : "+01:00"}`);
};

describe("French public holidays", () => {
  it("computes Easter", () => {
    expect(easterSunday(2026)).toEqual([4, 5]);
    expect(easterSunday(2027)).toEqual([3, 28]);
  });
  it("includes moving holidays", () => {
    const h = frenchHolidays(2026);
    expect(h).toContain("2026-04-06"); // Easter Monday
    expect(h).toContain("2026-05-14"); // Ascension
    expect(h).toContain("2026-05-25"); // Whit Monday
    expect(h).toContain("2026-12-25");
    expect(h).toHaveLength(11);
  });
});

describe("quiet hours", () => {
  it("SMS only 9:00–20:00 Mon–Sat", () => {
    expect(isSendAllowed(paris("2026-10-13 08:59"), "SMS")).toBe(false); // Tuesday
    expect(isSendAllowed(paris("2026-10-13 09:00"), "SMS")).toBe(true);
    expect(isSendAllowed(paris("2026-10-13 19:59"), "SMS")).toBe(true);
    expect(isSendAllowed(paris("2026-10-13 20:00"), "SMS")).toBe(false);
    expect(isSendAllowed(paris("2026-10-17 12:00"), "SMS")).toBe(true); // Saturday
    expect(isSendAllowed(paris("2026-10-18 12:00"), "SMS")).toBe(false); // Sunday
  });

  it("e-mail has a wider window but still never on Sundays", () => {
    expect(isSendAllowed(paris("2026-10-13 08:30"), "EMAIL")).toBe(true);
    expect(isSendAllowed(paris("2026-10-13 20:30"), "EMAIL")).toBe(true);
    expect(isSendAllowed(paris("2026-10-13 21:00"), "EMAIL")).toBe(false);
    expect(isSendAllowed(paris("2026-10-18 10:00"), "EMAIL")).toBe(false);
  });

  it("skips public holidays unless disabled", () => {
    expect(isSendAllowed(paris("2026-11-11 10:00"), "SMS")).toBe(false); // Armistice (Wednesday)
    expect(isSendAllowed(paris("2026-11-11 10:00"), "SMS", { skipHolidays: false })).toBe(true);
  });

  it("moves to the next slot", () => {
    expect(nextAllowedSendTime(paris("2026-10-13 07:10"), "SMS")).toEqual(paris("2026-10-13 09:00")); // same morning
    expect(nextAllowedSendTime(paris("2026-10-13 21:30"), "SMS")).toEqual(paris("2026-10-14 09:00")); // next day
    expect(nextAllowedSendTime(paris("2026-10-17 20:15"), "SMS")).toEqual(paris("2026-10-19 09:00")); // Sat evening → Monday
    expect(nextAllowedSendTime(paris("2026-11-10 22:00"), "SMS")).toEqual(paris("2026-11-12 09:00")); // skips 11 Nov
    expect(nextAllowedSendTime(paris("2026-12-24 20:30"), "SMS")).toEqual(paris("2026-12-26 09:00")); // skips Christmas (Fri) → Sat
    const ok = paris("2026-10-13 15:00");
    expect(nextAllowedSendTime(ok, "SMS")).toBe(ok);
  });

  it("is correct across the DST change (last Sunday of March / October)", () => {
    expect(nextAllowedSendTime(paris("2026-03-28 21:00"), "SMS")).toEqual(paris("2026-03-30 09:00")); // Sat → Mon, after spring forward
    expect(nextAllowedSendTime(paris("2026-03-30 09:00"), "SMS").toISOString()).toBe("2026-03-30T07:00:00.000Z");
    expect(nextAllowedSendTime(paris("2026-10-24 22:00"), "SMS").toISOString()).toBe("2026-10-26T08:00:00.000Z"); // after fall back
  });
});
