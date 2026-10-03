import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** Short-code alphabet without look-alikes (0/O, 1/l/I), friendlier when typed by hand. */
const SHORT = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomCode(length = 8, alphabet = SHORT): string {
  const bytes = randomBytes(length * 2);
  let out = "";
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    const b = bytes[i]!;
    // rejection sampling to avoid modulo bias
    if (b < 256 - (256 % alphabet.length)) out += alphabet[b % alphabet.length];
  }
  return out.length === length ? out : randomCode(length, alphabet);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function base62(length = 12): string {
  return randomCode(length, BASE62);
}

/** Keyed hash (HMAC-SHA256, hex). Used for opt-out lists and token storage. */
export function keyedHash(value: string, secret: string, purpose: string): string {
  return createHmac("sha256", `${purpose}:${secret}`).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
