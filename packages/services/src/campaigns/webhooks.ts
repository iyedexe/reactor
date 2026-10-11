import { z } from "zod";
import { forTenant, type TenantDb } from "@avis/db";
import { systemDb } from "@avis/db/system";
import { env } from "@avis/core/env";
import { keyedHash, randomToken, safeEqual } from "@avis/core/crypto";
import { upsertContact, ContactError } from "./contacts.ts";
import { optOut, type Channel } from "./optout.ts";

// ───────────────────────────── Booking-tool webhook ─────────────────────────────

const tokenHash = (token: string) => keyedHash(token, env().APP_SECRET, "webhook");

/** Creates an inbound webhook for a location. The token is shown once; only its hash is stored. */
export async function createBookingWebhook(db: TenantDb, locationId: string, name: string) {
  const token = `whk_${randomToken(24)}`;
  const hook = await db.inboundWebhook.create({ data: { organizationId: db.organizationId, locationId, name: name.trim().slice(0, 80) || "Réservations", tokenHash: tokenHash(token) } });
  return { id: hook.id, token };
}

const bookingPayload = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().nullable(),
  email: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  externalId: z.string().trim().max(120).optional().nullable(),
  visitAt: z.coerce.date().optional().nullable(),
  // Consent must be explicit: the booking tool sends what the customer ticked.
  consentEmail: z.boolean().optional(),
  consentSms: z.boolean().optional(),
});

export type BookingResult =
  | { ok: true; contactId: string; created: boolean; schedule: string }
  | { ok: false; status: 401 | 404 | 422; error: string };

export async function handleBookingWebhook(webhookId: string, bearer: string | null, body: unknown): Promise<BookingResult> {
  const hook = await systemDb().inboundWebhook.findUnique({ where: { id: webhookId } });
  if (!hook) return { ok: false, status: 404, error: "unknown webhook" };
  if (!bearer || !safeEqual(tokenHash(bearer), hook.tokenHash)) return { ok: false, status: 401, error: "invalid token" };
  const parsed = bookingPayload.safeParse(body);
  if (!parsed.success) return { ok: false, status: 422, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const p = parsed.data;
  const db = forTenant({ organizationId: hook.organizationId });
  try {
    const res = await upsertContact(db, {
      locationId: hook.locationId,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone,
      externalId: p.externalId,
      source: "WEBHOOK",
      consent: { email: p.consentEmail, sms: p.consentSms },
      consentEvidence: `Consentement transmis par « ${hook.name} »`,
      consentSource: `webhook:${hook.id}`,
      visitAt: p.visitAt ?? new Date(),
    });
    await db.inboundWebhook.update({ where: { id: hook.id }, data: { lastUsedAt: new Date() } });
    return { ok: true, contactId: res.contactId, created: res.created, schedule: res.schedule?.status === "skipped" ? `skipped:${res.schedule.reason}` : (res.schedule?.status ?? "none") };
  } catch (e) {
    if (e instanceof ContactError) return { ok: false, status: 422, error: e.message };
    throw e;
  }
}

// ───────────────────────────── Delivery events (Brevo) ─────────────────────────────

export type DeliveryEvent =
  | { kind: "delivered" | "failed"; messageId: string }
  | { kind: "bounce" | "complaint" | "unsubscribe"; messageId: string | null; email?: string }
  | { kind: "sms_stop"; phone: string }
  | { kind: "ignored" };

/**
 * Normalizes a Brevo webhook payload (transactional e-mail or SMS). Brevo documents snake_case event names
 * in payloads ("hard_bounce") and camelCase in settings ("hardBounce"); both are accepted.
 */
export function parseBrevoEvent(body: Record<string, unknown>): DeliveryEvent {
  const ev = String(body.event ?? body.msg_status ?? body.status ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const messageId = (body["message-id"] ?? body.messageId ?? body.message_id ?? body["Message-Id"] ?? null) as string | null;
  const email = typeof body.email === "string" ? body.email : undefined;
  const reply = String(body.reply ?? body.text ?? body.content ?? "").trim();
  const phone = String(body.to ?? body.from ?? body.phone ?? body.number ?? "");
  if ((ev === "reply" || ev === "replied") && /^stop\b/i.test(reply) && phone) return { kind: "sms_stop", phone };
  if (ev === "delivered") return messageId ? { kind: "delivered", messageId: String(messageId) } : { kind: "ignored" };
  if (["hardbounce", "softbounce", "blocked", "invalidemail", "invalid", "rejected", "error", "skip"].includes(ev)) {
    if (ev === "hardbounce" || ev === "invalidemail" || ev === "invalid") return { kind: "bounce", messageId: messageId ? String(messageId) : null, email };
    return messageId ? { kind: "failed", messageId: String(messageId) } : { kind: "ignored" };
  }
  if (ev === "spam" || ev === "complaint") return { kind: "complaint", messageId: messageId ? String(messageId) : null, email };
  if (ev === "unsubscribed" || ev === "unsubscribe") return { kind: "unsubscribe", messageId: messageId ? String(messageId) : null, email };
  return { kind: "ignored" };
}

/** Applies a delivery event: message status, and opt-out on hard bounce / complaint / unsubscribe / STOP. */
export async function applyDeliveryEvent(evt: DeliveryEvent): Promise<string> {
  const db = systemDb();
  if (evt.kind === "ignored") return "ignored";
  if (evt.kind === "sms_stop") {
    const contacts = await db.contact.findMany({ where: { phone: evt.phone }, select: { organizationId: true }, distinct: ["organizationId"] });
    for (const c of contacts) await optOut(c.organizationId, "SMS", evt.phone, "STOP", "sms-stop");
    return `stop:${contacts.length}`;
  }
  const message = evt.messageId ? await db.message.findFirst({ where: { providerMessageId: evt.messageId } }) : null;
  if (evt.kind === "delivered" || evt.kind === "failed") {
    if (!message) return "unknown-message";
    await db.message.update({ where: { id: message.id }, data: evt.kind === "delivered" ? { status: "DELIVERED", deliveredAt: new Date() } : { status: "FAILED" } });
    return evt.kind;
  }
  // bounce / complaint / unsubscribe → opt-out for the organization that sent it
  if (message?.organizationId && (evt.kind === "bounce" || evt.kind === "complaint" || evt.kind === "unsubscribe")) {
    if (evt.kind === "bounce") await db.message.update({ where: { id: message.id }, data: { status: "BOUNCED" } });
    const reason = evt.kind === "bounce" ? "BOUNCE" : evt.kind === "complaint" ? "COMPLAINT" : "UNSUBSCRIBE";
    await optOut(message.organizationId, message.channel as Channel, evt.email ?? message.to, reason, `provider:${evt.kind}`);
    return evt.kind;
  }
  return "unknown-message";
}
