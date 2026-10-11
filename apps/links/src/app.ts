import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Logger } from "pino";
import { keyedHash } from "@avis/core/crypto";
import { googleWriteReviewUrl } from "@avis/core/google";
import { StandCache, type StandEntry } from "./cache.ts";
import { EventWriter, type LinkEvent } from "./events.ts";
import { errorPage, feedbackPage, inactivePage, landingPage, notFoundPage, thanksPage, type Brand } from "./html.ts";
import { isBot, parseUserAgent } from "./ua.ts";

export interface LinksOptions {
  pool: Pool;
  secret: string;
  log: Logger;
  /** Where deactivated stands send people (e.g. your sales page). Default: a neutral "inactive" page. */
  inactiveRedirectUrl?: string;
  eventFlushMs?: number;
}

const CODE = /^[A-Za-z0-9]{4,32}$/;
const TOKEN = /^[A-Za-z0-9_-]{8,64}$/;
const FEEDBACK_LIMIT_PER_HOUR = 5;

interface Target {
  kind: "stand" | "message";
  organizationId: string;
  locationId: string;
  standId: string | null;
  reviewRequestId: string | null;
  brand: Brand;
  googleUrl: string | null;
  base: string; // "/r/{code}" or "/m/{token}"
}

export function createLinksApp(opts: LinksOptions) {
  const { pool, log } = opts;
  const cache = new StandCache(pool, log);
  const events = new EventWriter(pool, log, opts.eventFlushMs);
  const feedbackHits = new Map<string, number[]>();

  function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}) {
    res.writeHead(status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...headers,
    });
    res.end(body);
  }

  function redirect(res: ServerResponse, url: string) {
    res.writeHead(302, { location: url, "cache-control": "no-store", "referrer-policy": "no-referrer" });
    res.end();
  }

  function visitor(req: IncomingMessage) {
    const ua = req.headers["user-agent"];
    const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() || req.socket.remoteAddress || "";
    const day = new Date().toISOString().slice(0, 10);
    return {
      bot: isBot(ua),
      ...parseUserAgent(ua),
      // Salted with the secret and the day: lets us count unique visitors without storing IPs.
      hash: keyedHash(`${ip}|${ua ?? ""}|${day}`, opts.secret, "visitor").slice(0, 32),
    };
  }

  function track(req: IncomingMessage, t: Target, type: LinkEvent["type"], source: LinkEvent["source"]) {
    const v = visitor(req);
    if (v.bot) return;
    events.push({
      organizationId: t.organizationId,
      locationId: t.locationId,
      standId: t.standId,
      reviewRequestId: t.reviewRequestId,
      type,
      source,
      deviceType: v.deviceType,
      os: v.os,
      visitorHash: v.hash,
      occurredAt: new Date(),
    });
  }

  function standTarget(s: StandEntry): Target | null {
    if (s.status !== "ACTIVE" || !s.organizationId || !s.locationId || s.serviceState === "TERMINATED") return null;
    return {
      kind: "stand",
      organizationId: s.organizationId,
      locationId: s.locationId,
      standId: s.id,
      reviewRequestId: null,
      brand: { name: s.locationName ?? "", brandColor: s.brandColor },
      googleUrl: s.googleReviewUrl ?? (s.placeId ? googleWriteReviewUrl(s.placeId) : null),
      base: `/r/${s.code}`,
    };
  }

  async function messageTarget(token: string): Promise<Target | "inactive" | null> {
    const { rows } = await pool.query<{
      id: string;
      organizationId: string;
      locationId: string;
      locationName: string;
      brandColor: string;
      googleReviewUrl: string | null;
      placeId: string | null;
      serviceState: string;
    }>(
      `SELECT rr.id, rr."organizationId", rr."locationId", l.name AS "locationName", l."brandColor", l."googleReviewUrl", l."placeId", o."serviceState"
       FROM review_request rr JOIN location l ON l.id = rr."locationId" JOIN organization o ON o.id = rr."organizationId"
       WHERE rr.token = $1`,
      [token],
    );
    const r = rows[0];
    if (!r) return null;
    if (r.serviceState === "TERMINATED") return "inactive";
    return {
      kind: "message",
      organizationId: r.organizationId,
      locationId: r.locationId,
      standId: null,
      reviewRequestId: r.id,
      brand: { name: r.locationName, brandColor: r.brandColor },
      googleUrl: r.googleReviewUrl ?? (r.placeId ? googleWriteReviewUrl(r.placeId) : null),
      base: `/m/${token}`,
    };
  }

  function sourceOf(url: URL, t: Target): LinkEvent["source"] {
    if (t.kind === "message") return "MESSAGE";
    const s = url.searchParams.get("s");
    return s === "n" ? "NFC" : s === "q" ? "QR" : "UNKNOWN";
  }

  function withSource(path: string, url: URL): string {
    const s = url.searchParams.get("s");
    return s === "n" || s === "q" ? `${path}?s=${s}` : path;
  }

  async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 16_384) throw new Error("payload too large");
      chunks.push(chunk as Buffer);
    }
    return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  }

  function rateLimited(key: string): boolean {
    const now = Date.now();
    const hits = (feedbackHits.get(key) ?? []).filter((t) => now - t < 3_600_000);
    hits.push(now);
    feedbackHits.set(key, hits);
    if (feedbackHits.size > 10_000) feedbackHits.clear();
    return hits.length > FEEDBACK_LIMIT_PER_HOUR;
  }

  async function handleFeedbackPost(req: IncomingMessage, res: ServerResponse, url: URL, t: Target) {
    const form = await readForm(req);
    const googleLink = withSource(`${t.base}/google`, url);
    const values = {
      message: (form.get("message") ?? "").trim(),
      name: (form.get("name") ?? "").trim().slice(0, 100),
      email: (form.get("email") ?? "").trim().toLowerCase().slice(0, 200),
      phone: (form.get("phone") ?? "").trim().slice(0, 30),
      wantsReply: form.get("wantsReply") ? "1" : "",
    };
    if (form.get("website")) return send(res, 200, thanksPage(t.brand, googleLink)); // honeypot: silently drop bots
    const action = withSource(`${t.base}/message`, url);
    if (values.message.length < 3 || values.message.length > 2000) {
      return send(res, 422, feedbackPage(t.brand, action, googleLink, "Merci d'écrire un message (3 à 2000 caractères).", values));
    }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      return send(res, 422, feedbackPage(t.brand, action, googleLink, "Adresse e-mail invalide.", values));
    }
    if (rateLimited(visitor(req).hash)) {
      return send(res, 429, feedbackPage(t.brand, action, googleLink, "Trop de messages envoyés. Réessayez plus tard.", values));
    }
    await pool.query(
      `INSERT INTO private_feedback (id, "organizationId", "locationId", "standId", "reviewRequestId", message, "contactName", "contactEmail", "contactPhone", "wantsReply", status, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'NEW', now())`,
      [randomUUID(), t.organizationId, t.locationId, t.standId, t.reviewRequestId, values.message, values.name || null, values.email || null, values.phone || null, !!values.wantsReply],
    );
    track(req, t, "FEEDBACK_SENT", sourceOf(url, t));
    send(res, 200, thanksPage(t.brand, googleLink));
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://links.local");
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/healthz") {
      let db = "ok";
      try {
        await pool.query("SELECT 1");
      } catch {
        db = "unreachable";
      }
      // Healthy as long as we can serve stands: from the database or from the cache.
      const ok = db === "ok" || cache.size > 0;
      res.writeHead(ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ status: ok ? "ok" : "error", service: "links", db, cachedStands: cache.size, cacheLoadedAt: cache.loadedAt, pendingEvents: events.pending }));
      return;
    }

    const [prefix, id, action] = parts;
    if ((prefix !== "r" && prefix !== "m") || !id || parts.length > 3) return send(res, 404, notFoundPage());

    let target: Target | null;
    if (prefix === "r") {
      if (!CODE.test(id)) return send(res, 404, notFoundPage());
      const stand = await cache.get(id);
      if (!stand) return send(res, 404, notFoundPage());
      target = standTarget(stand);
      if (!target) return opts.inactiveRedirectUrl ? redirect(res, opts.inactiveRedirectUrl) : send(res, 410, inactivePage());
    } else {
      if (!TOKEN.test(id)) return send(res, 404, notFoundPage());
      const t = await messageTarget(id);
      if (!t) return send(res, 404, notFoundPage());
      if (t === "inactive") return send(res, 410, inactivePage());
      target = t;
    }

    const source = sourceOf(url, target);
    const googleLink = withSource(`${target.base}/google`, url);
    const messageLink = withSource(`${target.base}/message`, url);

    if (!action && req.method === "GET") {
      track(req, target, target.kind === "stand" ? "SCAN" : "MESSAGE_CLICK", source);
      if (target.kind === "message" && !visitor(req).bot) {
        // First click on an e-mail/SMS link: mark the request as clicked (async, never blocks the page).
        pool
          .query(
            `UPDATE review_request SET "clickedAt" = now(), status = 'CLICKED', "updatedAt" = now()
             WHERE id = $1 AND "clickedAt" IS NULL AND status IN ('SENT', 'REMINDED')`,
            [target.reviewRequestId],
          )
          .catch((err) => log.error({ err }, "could not mark request as clicked"));
      }
      return send(res, 200, landingPage(target.brand, { google: googleLink, message: messageLink }));
    }
    if (action === "google" && req.method === "GET") {
      track(req, target, "GOOGLE_CLICK", source);
      if (!target.googleUrl) return send(res, 503, errorPage());
      return redirect(res, target.googleUrl);
    }
    if (action === "message" && req.method === "GET") {
      track(req, target, "FEEDBACK_OPEN", source);
      return send(res, 200, feedbackPage(target.brand, messageLink, googleLink));
    }
    if (action === "message" && req.method === "POST") return handleFeedbackPost(req, res, url, target);
    return send(res, 404, notFoundPage());
  }

  const server: Server = createServer((req, res) => {
    const started = Date.now();
    route(req, res)
      .catch((err) => {
        log.error({ err, url: req.url }, "request failed");
        if (!res.headersSent) send(res, 503, errorPage());
      })
      .finally(() => {
        if (req.url !== "/healthz") log.debug({ method: req.method, url: req.url, status: res.statusCode, ms: Date.now() - started }, "request");
      });
  });
  server.keepAliveTimeout = 5_000;

  return {
    server,
    cache,
    events,
    async start(port: number, host = "0.0.0.0") {
      await cache.start();
      events.start();
      await new Promise<void>((resolve) => server.listen(port, host, resolve));
    },
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await events.stop();
      await cache.stop();
    },
  };
}
