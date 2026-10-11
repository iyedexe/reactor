import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Logger } from "pino";
import type { DeviceType } from "./ua.ts";

export interface LinkEvent {
  organizationId: string;
  locationId: string;
  standId: string | null;
  reviewRequestId: string | null;
  type: "SCAN" | "MESSAGE_CLICK" | "GOOGLE_CLICK" | "FEEDBACK_OPEN" | "FEEDBACK_SENT";
  source: "NFC" | "QR" | "MESSAGE" | "UNKNOWN";
  deviceType: DeviceType;
  os: string | null;
  visitorHash: string | null;
  occurredAt: Date;
}

const MAX_BUFFER = 20_000;

/** Buffers events and writes them in multi-row INSERTs, off the request path. Retries on failure. */
export class EventWriter {
  private buffer: LinkEvent[] = [];
  private timer?: NodeJS.Timeout;
  private flushing = false;
  dropped = 0;

  constructor(private readonly pool: Pool, private readonly log: Logger, private readonly intervalMs = 2_000, private readonly batch = 500) {}

  start(): void {
    this.timer = setInterval(() => void this.flush(), this.intervalMs);
    this.timer.unref();
  }

  push(e: LinkEvent): void {
    if (this.buffer.length >= MAX_BUFFER) {
      this.buffer.shift();
      this.dropped++;
    }
    this.buffer.push(e);
    if (this.buffer.length >= this.batch) void this.flush();
  }

  get pending(): number {
    return this.buffer.length;
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const chunk = this.buffer.splice(0, this.batch);
    try {
      const values: unknown[] = [];
      const rows = chunk.map((e, i) => {
        const o = i * 11;
        values.push(randomUUID(), e.organizationId, e.locationId, e.standId, e.reviewRequestId, e.type, e.source, e.deviceType, e.os, e.visitorHash, e.occurredAt);
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}::"LinkEventType", $${o + 7}::"LinkSource", $${o + 8}::"DeviceType", $${o + 9}, $${o + 10}, $${o + 11})`;
      });
      await this.pool.query(
        `INSERT INTO link_event (id, "organizationId", "locationId", "standId", "reviewRequestId", type, source, "deviceType", os, "visitorHash", "occurredAt") VALUES ${rows.join(",")}`,
        values,
      );
    } catch (err) {
      this.log.error({ err, events: chunk.length }, "event flush failed, will retry");
      this.buffer.unshift(...chunk);
    } finally {
      this.flushing = false;
    }
    if (this.buffer.length >= this.batch) await this.flush();
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    for (let i = 0; i < 5 && this.buffer.length; i++) await this.flush();
  }
}
