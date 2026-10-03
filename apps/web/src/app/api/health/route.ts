import { systemDb } from "@avis/db/system";

export const dynamic = "force-dynamic";

/** Liveness + DB readiness for Docker healthchecks and uptime monitoring. */
export async function GET() {
  const started = Date.now();
  try {
    await systemDb().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", service: "web", db: "ok", latencyMs: Date.now() - started });
  } catch {
    return Response.json({ status: "error", service: "web", db: "unreachable" }, { status: 503 });
  }
}
