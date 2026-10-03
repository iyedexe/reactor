import { describe, expect, it } from "vitest";
import { isMobileFr, normalizeEmail, normalizePhone } from "./contact.ts";

describe("normalizePhone", () => {
  it.each([
    ["06 12 34 56 78", "+33612345678"],
    ["+33 6 12 34 56 78", "+33612345678"],
    ["0033612345678", "+33612345678"],
    ["33612345678", "+33612345678"],
    ["06.12.34.56.78", "+33612345678"],
    ["+32 470 12 34 56", "+32470123456"],
  ])("%s → %s", (input, expected) => expect(normalizePhone(input)).toBe(expected));

  it.each(["", "12", "abc", "+0612"])("rejects %s", (input) => expect(normalizePhone(input)).toBeNull());

  it("detects French mobiles", () => {
    expect(isMobileFr("+33612345678")).toBe(true);
    expect(isMobileFr("+33145678901")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => expect(normalizeEmail("  Marie.Dupont@Gmail.COM ")).toBe("marie.dupont@gmail.com"));
  it("rejects invalid", () => expect(normalizeEmail("marie@")).toBeNull());
});
