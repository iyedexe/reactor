import { applyDeliveryEvent, parseBrevoEvent } from "@avis/services";
import { env } from "@avis/core/env";
import { safeEqual } from "@avis/core/crypto";
import { createLogger } from "@avis/core/logger";

const log = createLogger("brevo-webhook");

/**
 * Brevo delivery events (e-mail + SMS). Configure in Brevo: https://<app>/api/webhooks/brevo?token=<BREVO_WEBHOOK_TOKEN>
 * Hard bounces, spam complaints, unsubscribes and SMS "STOP" replies become opt-outs.
 */
export async function POST(req: Request) {
  const expected = env().BREVO_WEBHOOK_TOKEN;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!expected || !safeEqual(token, expected)) return new Response("Forbidden", { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const events = (Array.isArray(body) ? body : [body]) as Record<string, unknown>[];
  const results: string[] = [];
  for (const e of events.slice(0, 500)) results.push(await applyDeliveryEvent(parseBrevoEvent(e)));
  log.info({ results }, "brevo events");
  return Response.json({ ok: true, results });
}
