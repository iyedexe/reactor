import pg from "pg";
import pino from "pino";
import { createLinksApp } from "./app.ts";

/**
 * AvisBoost public links: /r/{code} (NFC/QR stands) and /m/{token} (e-mail/SMS links).
 * Deliberately tiny: Node http + pg. Reads only what it needs from the environment.
 */
const log = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "links" }, timestamp: pino.stdTimeFunctions.isoTime, formatters: { level: (l) => ({ level: l }) } });
const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.APP_SECRET;
if (!databaseUrl || !secret || secret.length < 32) {
  log.fatal("DATABASE_URL and APP_SECRET (32+ chars) are required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: Number(process.env.DATABASE_POOL_SIZE ?? 10), connectionTimeoutMillis: 3_000, statement_timeout: 3_000 });
pool.on("error", (err) => log.error({ err }, "pg pool error"));

const app = createLinksApp({ pool, secret, log, inactiveRedirectUrl: process.env.LINKS_INACTIVE_REDIRECT_URL || undefined });
const port = Number(process.env.PORT ?? 3002);
await app.start(port);
log.info({ port, stands: app.cache.size }, "links service started");

async function shutdown(signal: string) {
  log.info({ signal }, "shutting down");
  await app.stop();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
