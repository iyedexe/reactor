import type { Job } from "pg-boss";
import { adapters } from "@avis/adapters";
import { env } from "@avis/core/env";
import { createLogger } from "@avis/core/logger";
import { forTenant } from "@avis/db";
import { disconnectPrisma, systemDb } from "@avis/db/system";
import { DAY } from "@avis/core/dates";
import {
  captureBaseline,
  createBoss,
  JOBS,
  processNewReview,
  refreshCompetitors,
  rollupAll,
  rollupLocation,
  syncLocationReviews,
  type JobData,
} from "@avis/services";
import { startHealthServer, type HealthState } from "./health.ts";
import { generateMockReviews } from "./mock-generator.ts";

const e = env();
const log = createLogger("worker", e.LOG_LEVEL);
const state: HealthState = { startedAt: new Date(), bossReady: false, lastJobAt: null, lastError: null };
const TZ = "Europe/Paris";

/** Wraps a handler with structured logging and health bookkeeping. pg-boss retries failures. */
function handler<N extends keyof JobData>(name: N, fn: (data: JobData[N], job: Job<JobData[N]>) => Promise<unknown>) {
  return async (jobs: Job<JobData[N]>[]) => {
    for (const job of jobs) {
      const started = Date.now();
      try {
        const result = await fn(job.data, job);
        state.lastJobAt = new Date();
        log.info({ job: name, jobId: job.id, ms: Date.now() - started, result }, "job done");
      } catch (err) {
        state.lastError = `${name}: ${String(err)}`;
        log.error({ job: name, jobId: job.id, err, retry: job.retryCount }, "job failed");
        throw err;
      }
    }
  };
}

async function main() {
  const health = startHealthServer(e.WORKER_HEALTH_PORT, state);
  const boss = createBoss({ worker: true, connectionString: e.DATABASE_URL });
  boss.on("error", (err) => log.error({ err }, "pg-boss error"));
  await boss.start();

  const retry = { retryLimit: 5, retryDelay: 60, retryBackoff: true, retryDelayMax: 3600 };
  for (const name of Object.values(JOBS)) await boss.createQueue(name, retry);

  const { google, llm, places } = adapters();

  await boss.work<JobData["reviews.sync-all"]>(JOBS.syncAll, handler(JOBS.syncAll, async (data) => {
    const locations = await systemDb().location.findMany({
      where: { status: "ACTIVE", gbpLocationId: { not: null }, organization: { serviceState: "ACTIVE" } },
      select: { id: true, organizationId: true },
    });
    for (const l of locations) {
      await boss.send(JOBS.syncLocation, { organizationId: l.organizationId, locationId: l.id, full: data.full }, { singletonKey: l.id });
    }
    return { locations: locations.length };
  }));

  await boss.work<JobData["reviews.sync"]>(JOBS.syncLocation, { batchSize: 1 }, handler(JOBS.syncLocation, async (data) => {
    const res = await syncLocationReviews(google, data.organizationId, data.locationId, { full: data.full });
    for (const reviewId of res.created) {
      await boss.send(JOBS.processReview, { organizationId: data.organizationId, reviewId }, { singletonKey: reviewId });
    }
    if (!res.skipped) {
      // First successful sync of a new client's location = onboarding baseline.
      const hasBaseline = await forTenant({ organizationId: data.organizationId }).baselineSnapshot.count({ where: { locationId: data.locationId } });
      if (!hasBaseline) await captureBaseline(data.organizationId, data.locationId);
      if (res.created.length || res.updated || res.removed.length || res.repliesImported) {
        await boss.send(JOBS.rollupLocation, { locationId: data.locationId, days: 2 }, { singletonKey: data.locationId, singletonSeconds: 60 });
      }
    }
    return { ...res, created: res.created.length, removed: res.removed.length };
  }));

  await boss.work<JobData["reviews.process"]>(JOBS.processReview, handler(JOBS.processReview, async (data) => {
    const r = await processNewReview(llm, data.organizationId, data.reviewId);
    return { category: r.category, topics: r.topics };
  }));

  await boss.work<JobData["stats.rollup-all"]>(JOBS.rollupAll, handler(JOBS.rollupAll, async (data) => ({ rows: await rollupAll(data.days ?? 3) })));

  await boss.work<JobData["stats.rollup-location"]>(JOBS.rollupLocation, handler(JOBS.rollupLocation, async (data) => {
    const now = new Date();
    return { rows: await rollupLocation(data.locationId, new Date(now.getTime() - (data.days ?? 2) * DAY), now) };
  }));

  await boss.work(JOBS.mockGenerateReviews, handler(JOBS.mockGenerateReviews, async () => ({ created: await generateMockReviews() })));

  await boss.work(JOBS.competitorsAll, handler(JOBS.competitorsAll, async () => {
    const locations = await systemDb().location.findMany({
      where: { status: "ACTIVE", organization: { serviceState: "ACTIVE" } },
      select: { id: true, organizationId: true },
    });
    for (const l of locations) {
      await boss.send(JOBS.competitorsLocation, { organizationId: l.organizationId, locationId: l.id }, { singletonKey: l.id });
    }
    return { locations: locations.length };
  }));

  await boss.work<JobData["competitors.refresh"]>(JOBS.competitorsLocation, handler(JOBS.competitorsLocation, async (data) =>
    refreshCompetitors(places, data.organizationId, data.locationId),
  ));

  // Schedules (stored in Postgres; safe to re-declare on every boot).
  await boss.schedule(JOBS.competitorsAll, "20 4 * * 1", {}, { tz: TZ }); // Mondays 04:20
  await boss.schedule(JOBS.syncAll, "*/15 * * * *", {}, { tz: TZ, key: "incremental" });
  await boss.schedule(JOBS.syncAll, "10 3 * * *", { full: true }, { tz: TZ, key: "nightly-full" });
  await boss.schedule(JOBS.rollupAll, "40 3 * * *", { days: 3 }, { tz: TZ });
  if (e.GOOGLE_MODE === "mock" && e.MOCK_REVIEW_GENERATOR) {
    await boss.schedule(JOBS.mockGenerateReviews, "*/20 * * * *", {}, { tz: TZ });
  } else {
    await boss.unschedule(JOBS.mockGenerateReviews);
  }

  state.bossReady = true;
  log.info({ port: e.WORKER_HEALTH_PORT, googleMode: e.GOOGLE_MODE }, "worker started");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    state.bossReady = false;
    health.close();
    await boss.stop({ graceful: true, timeout: 20_000 });
    await disconnectPrisma();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  log.fatal({ err }, "worker failed to start");
  process.exit(1);
});
