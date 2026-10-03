import { describe, expect, it } from "vitest";
import { keyedHash, randomCode, safeEqual } from "./crypto.ts";

describe("crypto helpers", () => {
  it("random codes have the requested length and no look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const c = randomCode(8);
      expect(c).toHaveLength(8);
      expect(c).not.toMatch(/[01lIoO]/);
    }
  });

  it("keyed hashes depend on secret and purpose", () => {
    const a = keyedHash("+33612345678", "s1", "suppression");
    expect(a).toBe(keyedHash("+33612345678", "s1", "suppression"));
    expect(a).not.toBe(keyedHash("+33612345678", "s2", "suppression"));
    expect(a).not.toBe(keyedHash("+33612345678", "s1", "visitor"));
  });

  it("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
