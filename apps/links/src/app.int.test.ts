import type { AddressInfo } from "node:net";
import pg from "pg";
import pino from "pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLinksApp } from "./app.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let app: ReturnType<typeof createLinksApp>;
let base: string;

const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
const get = (path: string, ua = IPHONE) => fetch(base + path, { headers: { "user-agent": ua }, redirect: "manual" });
const post = (path: string, body: Record<string, string>, ua = IPHONE) =>
  fetch(base + path, { method: "POST", headers: { "user-agent": ua, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }, body: new URLSearchParams(body), redirect: "manual" });
const events = async () => {
  await app.events.flush();
  return (await q(`SELECT type::text, source::text, "deviceType"::text, "standId", "reviewRequestId" FROM link_event ORDER BY "occurredAt"`)).rows;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function seed() {
  const tables = (await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`)).rows.map((r) => `"${r.tablename}"`);
  await q(`TRUNCATE ${tables.join(",")} CASCADE`);
  await q(`INSERT INTO organization (id, name, slug, "serviceState") VALUES ('org1', 'Barbier', 'barbier', 'ACTIVE'), ('org2', 'Fermé', 'ferme', 'TERMINATED')`);
  await q(`INSERT INTO location (id, "organizationId", name, category, "brandColor", "placeId", "googleReviewUrl", "updatedAt") VALUES
    ('loc1', 'org1', 'Le Barbier <script>alert(1)</script>', 'barber_shop', '#123456', 'PLACE1', 'https://search.google.com/local/writereview?placeid=PLACE1', now()),
    ('loc2', 'org2', 'Ancien client', 'barber_shop', '#123456', 'PLACE2', NULL, now())`);
  await q(`INSERT INTO stand (id, code, "organizationId", "locationId", status, "updatedAt") VALUES
    ('s1', 'ACTIVE01', 'org1', 'loc1', 'ACTIVE', now()),
    ('s2', 'INACTIV1', 'org1', 'loc1', 'INACTIVE', now()),
    ('s3', 'STOCK001', NULL, NULL, 'UNASSIGNED', now()),
    ('s4', 'TERMIN01', 'org2', 'loc2', 'ACTIVE', now())`);
  await q(`INSERT INTO contact (id, "organizationId", "locationId", "firstName", source, "updatedAt") VALUES ('c1', 'org1', 'loc1', 'Karim', 'MANUAL', now())`);
  await q(`INSERT INTO review_request (id, "organizationId", "locationId", "contactId", token, channel, "scheduledAt", status, "sentAt", "updatedAt") VALUES ('rr1', 'org1', 'loc1', 'c1', 'tok_abcdef123', 'SMS', now(), 'SENT', now(), now())`);
}

beforeAll(async () => {
  await seed();
  app = createLinksApp({ pool, secret: "test-secret-test-secret-test-secret", log: pino({ level: "silent" }), eventFlushMs: 60_000 });
  await app.start(0, "127.0.0.1");
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await app.events.flush();
  await q(`DELETE FROM link_event`);
  await q(`DELETE FROM private_feedback`);
});

afterAll(async () => {
  await app.stop();
  await pool.end();
});

describe("stand landing page", () => {
  it("shows both options with identical styling (no review gating) and logs the scan", async () => {
    const res = await get("/r/ACTIVE01?s=n");
    expect(res.status).toBe(200);
    const html = await res.text();
    const choices = [...html.matchAll(/<a class="choice" href="([^"]+)"/g)].map((m) => m[1]);
    expect(choices).toEqual(["/r/ACTIVE01/google?s=n", "/r/ACTIVE01/message?s=n"]);
    expect(html).toContain("Laisser un avis Google");
    expect(html).toContain("Message privé au gérant");
    expect(html).not.toContain("<script>"); // business name is escaped
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await events()).toEqual([{ type: "SCAN", source: "NFC", deviceType: "MOBILE", standId: "s1", reviewRequestId: null }]);
  });

  it("the Google button logs a click and redirects to the review page", async () => {
    const res = await get("/r/ACTIVE01/google?s=q");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://search.google.com/local/writereview?placeid=PLACE1");
    expect((await events()).map((e) => [e.type, e.source])).toEqual([["GOOGLE_CLICK", "QR"]]);
  });

  it("link-preview bots are served but not counted", async () => {
    expect((await get("/r/ACTIVE01", "WhatsApp/2.23.20.0")).status).toBe(200);
    expect((await get("/r/ACTIVE01", "facebookexternalhit/1.1")).status).toBe(200);
    expect(await events()).toEqual([]);
  });

  it("unknown, malformed, inactive, unassigned and terminated stands", async () => {
    expect((await get("/r/NOPE0000")).status).toBe(404);
    expect((await get("/r/<x>")).status).toBe(404);
    expect((await get("/r/INACTIV1")).status).toBe(410);
    expect((await get("/r/STOCK001")).status).toBe(410);
    expect((await get("/r/TERMIN01")).status).toBe(410);
    expect((await get("/somewhere")).status).toBe(404);
    expect(await events()).toEqual([]);
  });

  it("picks up stand changes immediately through LISTEN/NOTIFY", async () => {
    await q(`UPDATE stand SET status = 'INACTIVE' WHERE code = 'ACTIVE01'`);
    await sleep(600);
    expect((await get("/r/ACTIVE01")).status).toBe(410);
    await q(`UPDATE stand SET status = 'ACTIVE' WHERE code = 'ACTIVE01'`);
    await sleep(600);
    expect((await get("/r/ACTIVE01")).status).toBe(200);
  });

  it("keeps serving cached stands when the database is down", async () => {
    await get("/r/ACTIVE01");
    const original = pool.query.bind(pool);
    (pool as unknown as { query: unknown }).query = () => Promise.reject(new Error("db down"));
    try {
      expect((await get("/r/ACTIVE01")).status).toBe(200);
      const health = await (await get("/healthz")).json();
      expect(health).toMatchObject({ status: "ok", db: "unreachable" });
    } finally {
      (pool as unknown as { query: unknown }).query = original;
    }
  });
});

describe("private feedback", () => {
  it("stores a valid message and thanks the customer", async () => {
    const res = await post("/r/ACTIVE01/message", { message: "Musique trop forte", name: "Léa", email: "Lea@Example.com", wantsReply: "1" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Merci");
    const rows = (await q(`SELECT message, "contactEmail", "wantsReply", "standId", status::text FROM private_feedback`)).rows;
    expect(rows).toEqual([{ message: "Musique trop forte", contactEmail: "lea@example.com", wantsReply: true, standId: "s1", status: "NEW" }]);
    expect((await events()).map((e) => e.type)).toEqual(["FEEDBACK_SENT"]);
  });

  it("rejects empty messages and bad e-mails", async () => {
    expect((await post("/r/ACTIVE01/message", { message: " " })).status).toBe(422);
    expect((await post("/r/ACTIVE01/message", { message: "Bonjour", email: "pas-un-mail" })).status).toBe(422);
    expect((await q(`SELECT count(*)::int AS n FROM private_feedback`)).rows[0].n).toBe(0);
  });

  it("silently drops honeypot submissions", async () => {
    expect((await post("/r/ACTIVE01/message", { message: "Buy now", website: "spam.example" })).status).toBe(200);
    expect((await q(`SELECT count(*)::int AS n FROM private_feedback`)).rows[0].n).toBe(0);
  });

  it("rate-limits a single visitor", async () => {
    const send = () =>
      fetch(`${base}/r/ACTIVE01/message`, {
        method: "POST",
        headers: { "user-agent": IPHONE, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.50" },
        body: new URLSearchParams({ message: "Encore moi" }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await send()).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

describe("e-mail / SMS links", () => {
  it("marks the request as clicked once and shows the same landing page", async () => {
    const res = await get("/m/tok_abcdef123");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('href="/m/tok_abcdef123/google"');
    await sleep(100);
    const first = (await q(`SELECT "clickedAt", status::text FROM review_request WHERE id = 'rr1'`)).rows[0];
    expect(first.status).toBe("CLICKED");
    expect(first.clickedAt).not.toBeNull();
    await get("/m/tok_abcdef123");
    await sleep(100);
    const second = (await q(`SELECT "clickedAt" FROM review_request WHERE id = 'rr1'`)).rows[0];
    expect(second.clickedAt.getTime()).toBe(first.clickedAt.getTime());
    expect((await events()).map((e) => [e.type, e.source, e.reviewRequestId])).toEqual([
      ["MESSAGE_CLICK", "MESSAGE", "rr1"],
      ["MESSAGE_CLICK", "MESSAGE", "rr1"],
    ]);
  });

  it("unknown tokens are 404", async () => {
    expect((await get("/m/tok_unknown999")).status).toBe(404);
  });
});
