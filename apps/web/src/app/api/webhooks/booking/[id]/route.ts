import { handleBookingWebhook } from "@avis/services";

/**
 * Booking tools (Planity, Zenchef, TheFork, custom) call this after each appointment/visit:
 *   POST /api/webhooks/booking/{id}   Authorization: Bearer whk_…
 *   { "firstName": "Inès", "phone": "+33612345678", "consentSms": true, "visitAt": "2026-10-13T10:00:00+02:00" }
 */
export async function POST(req: Request, ctx: RouteContext<"/api/webhooks/booking/[id]">) {
  const { id } = await ctx.params;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const res = await handleBookingWebhook(id, bearer, body);
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  return Response.json(res, { status: 202 });
}
