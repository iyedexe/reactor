import type { Pool, PoolClient } from "pg";
import type { Logger } from "pino";

export interface StandEntry {
  id: string;
  code: string;
  status: "UNASSIGNED" | "ACTIVE" | "INACTIVE";
  organizationId: string | null;
  locationId: string | null;
  label: string | null;
  locationName: string | null;
  brandColor: string;
  googleReviewUrl: string | null;
  placeId: string | null;
  serviceState: "ACTIVE" | "SUSPENDED" | "TERMINATED" | null;
}

const QUERY = `
SELECT s.id, s.code, s.status, s."organizationId", s."locationId", s.label,
       l.name AS "locationName", COALESCE(l."brandColor", '#2563eb') AS "brandColor",
       l."googleReviewUrl", l."placeId", o."serviceState"
FROM stand s
LEFT JOIN location l ON l.id = s."locationId"
LEFT JOIN organization o ON o.id = s."organizationId"`;

/**
 * Every stand with its branding, in memory. Reloaded on Postgres NOTIFY (avis_links) and every 5 minutes.
 * If the database is unreachable the last loaded data keeps being served.
 */
export class StandCache {
  private byCode = new Map<string, StandEntry>();
  private listener?: PoolClient;
  private timer?: NodeJS.Timeout;
  private reloadTimer?: NodeJS.Timeout;
  loadedAt: Date | null = null;
  lastError: string | null = null;

  constructor(private readonly pool: Pool, private readonly log: Logger) {}

  get size() {
    return this.byCode.size;
  }

  async start(): Promise<void> {
    await this.reload().catch(() => undefined);
    this.timer = setInterval(() => void this.reload().catch(() => undefined), 5 * 60_000);
    this.timer.unref();
    void this.listen();
  }

  private async listen(): Promise<void> {
    try {
      this.listener = await this.pool.connect();
      this.listener.on("notification", () => this.scheduleReload());
      this.listener.on("error", (err) => {
        this.log.warn({ err }, "links cache listener lost, retrying");
        this.listener?.release(true);
        this.listener = undefined;
        setTimeout(() => void this.listen(), 5_000).unref();
      });
      await this.listener.query("LISTEN avis_links");
    } catch (err) {
      this.log.warn({ err }, "links cache LISTEN failed, retrying");
      this.listener?.release(true);
      this.listener = undefined;
      setTimeout(() => void this.listen(), 5_000).unref();
    }
  }

  /** Debounced so a batch of stand updates triggers a single reload. */
  scheduleReload(): void {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => void this.reload().catch(() => undefined), 200);
  }

  async reload(): Promise<void> {
    try {
      const { rows } = await this.pool.query<StandEntry>(QUERY);
      this.byCode = new Map(rows.map((r) => [r.code, r]));
      this.loadedAt = new Date();
      this.lastError = null;
      this.log.debug({ stands: rows.length }, "links cache reloaded");
    } catch (err) {
      this.lastError = String(err);
      this.log.error({ err }, "links cache reload failed; serving cached data");
      throw err;
    }
  }

  /** Cache first; on a miss, one query for that code (new stands appear without waiting for a reload). */
  async get(code: string): Promise<StandEntry | null> {
    const hit = this.byCode.get(code);
    if (hit) return hit;
    const { rows } = await this.pool.query<StandEntry>(`${QUERY} WHERE s.code = $1`, [code]);
    if (rows[0]) this.byCode.set(code, rows[0]);
    return rows[0] ?? null;
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    clearTimeout(this.reloadTimer);
    this.listener?.release();
    this.listener = undefined;
  }
}
