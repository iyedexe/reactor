import { PgBoss } from "pg-boss";

/** Job names and payloads, shared by the worker (consumer) and the web app (producer). */
export const JOBS = {
  syncAll: "reviews.sync-all",
  syncLocation: "reviews.sync",
  processReview: "reviews.process",
  rollupAll: "stats.rollup-all",
  rollupLocation: "stats.rollup-location",
  mockGenerateReviews: "mock.generate-reviews",
} as const;

export interface JobData {
  [JOBS.syncAll]: { full?: boolean };
  [JOBS.syncLocation]: { organizationId: string; locationId: string; full?: boolean };
  [JOBS.processReview]: { organizationId: string; reviewId: string };
  [JOBS.rollupAll]: { days?: number };
  [JOBS.rollupLocation]: { locationId: string; days?: number };
  [JOBS.mockGenerateReviews]: Record<string, never>;
}

export type JobName = (typeof JOBS)[keyof typeof JOBS];

export function createBoss(opts: { connectionString?: string; worker: boolean }): PgBoss {
  return new PgBoss({
    connectionString: opts.connectionString ?? process.env.DATABASE_URL,
    schema: "pgboss",
    max: opts.worker ? 10 : 3,
    // Only the worker runs schedules and maintenance; the web app only sends jobs.
    schedule: opts.worker,
    supervise: opts.worker,
    migrate: opts.worker,
  });
}

let producer: Promise<PgBoss> | undefined;

/** Lazily started, send-only pg-boss instance (web app). The worker owns schema migrations. */
export function producerBoss(): Promise<PgBoss> {
  producer ??= createBoss({ worker: false }).start();
  return producer;
}

export async function enqueue<N extends JobName>(name: N, data: JobData[N], options: { singletonKey?: string; startAfter?: Date | number } = {}) {
  const boss = await producerBoss();
  return boss.send(name, data as object, options);
}
