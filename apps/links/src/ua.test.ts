import { describe, expect, it } from "vitest";
import { isBot, parseUserAgent } from "./ua.ts";

describe("user agent", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1", "MOBILE", "iOS"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36", "MOBILE", "Android"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1", "TABLET", "iOS"],
    ["Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/120 Safari/537.36", "TABLET", "Android"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 Safari/537.36", "DESKTOP", "Windows"],
  ])("%s", (ua, device, os) => expect(parseUserAgent(ua)).toEqual({ deviceType: device, os }));

  it("detects preview fetchers and scripts as bots", () => {
    for (const ua of ["WhatsApp/2.23", "facebookexternalhit/1.1", "Googlebot/2.1", "curl/8.0", "undici", undefined]) expect(isBot(ua)).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari")).toBe(false);
  });
});
