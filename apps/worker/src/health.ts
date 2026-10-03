import { createServer, type Server } from "node:http";
import { systemDb } from "@avis/db/system";

export interface HealthState {
  startedAt: Date;
  bossReady: boolean;
  lastJobAt: Date | null;
  lastError: string | null;
}

/** /healthz for Docker and uptime monitoring: process up, pg-boss started, database reachable. */
export function startHealthServer(port: number, state: HealthState): Server {
  const server = createServer(async (req, res) => {
    if (req.url !== "/healthz") {
      res.writeHead(404).end();
      return;
    }
    let db = "ok";
    try {
      await systemDb().$queryRaw`SELECT 1`;
    } catch {
      db = "unreachable";
    }
    const ok = state.bossReady && db === "ok";
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        status: ok ? "ok" : "error",
        service: "worker",
        db,
        queue: state.bossReady ? "ok" : "starting",
        uptimeSeconds: Math.round((Date.now() - state.startedAt.getTime()) / 1000),
        lastJobAt: state.lastJobAt,
        lastError: state.lastError,
      }),
    );
  });
  server.listen(port, "0.0.0.0");
  return server;
}
