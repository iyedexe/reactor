import { forTenant, type TenantDb } from "@avis/db";
import { systemDb } from "@avis/db/system";
import { env } from "@avis/core/env";
import { keyedHash } from "@avis/core/crypto";
import { normalizeEmail, normalizePhone } from "@avis/core/contact";

export type Channel = "EMAIL" | "SMS";
export type SuppressionReason = "UNSUBSCRIBE" | "STOP" | "BOUNCE" | "COMPLAINT" | "MANUAL";

export function normalizeDestination(channel: Channel, value: string): string | null {
  return channel === "EMAIL" ? normalizeEmail(value) : normalizePhone(value);
}

/** Opt-outs are stored as keyed hashes so they survive contact deletion (GDPR erasure) without keeping the address. */
export function suppressionHash(channel: Channel, value: string, secret = env().APP_SECRET): string {
  return keyedHash(`${channel}:${normalizeDestination(channel, value) ?? value.trim().toLowerCase()}`, secret, "suppression");
}

export async function isSuppressed(db: TenantDb, channel: Channel, value: string): Promise<boolean> {
  return (await db.suppression.count({ where: { channel, valueHash: suppressionHash(channel, value) } })) > 0;
}

/** Latest consent event per channel wins; no event = no consent. */
export function effectiveConsent(events: { channel: Channel; action: "GRANTED" | "WITHDRAWN"; createdAt: Date }[], channel: Channel): boolean {
  const last = events.filter((e) => e.channel === channel).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return last?.action === "GRANTED";
}

/**
 * Honors an opt-out everywhere in the organization: suppression list, consent withdrawn on every matching
 * contact, and pending requests/reminders on that channel cancelled.
 */
export async function optOut(organizationId: string, channel: Channel, value: string, reason: SuppressionReason, source: string) {
  const db = forTenant({ organizationId });
  const normalized = normalizeDestination(channel, value);
  const valueHash = suppressionHash(channel, value);
  await db.suppression.upsert({
    where: { organizationId_channel_valueHash: { organizationId, channel, valueHash } },
    create: { organizationId, channel, valueHash, reason },
    update: {},
  });
  if (!normalized) return { contacts: 0 };
  const contacts = await db.contact.findMany({ where: channel === "EMAIL" ? { email: normalized } : { phone: normalized }, select: { id: true } });
  for (const c of contacts) {
    await db.consentEvent.create({ data: { organizationId, contactId: c.id, channel, action: "WITHDRAWN", source } });
  }
  const ids = contacts.map((c) => c.id);
  if (ids.length) {
    await db.reviewRequest.updateMany({ where: { contactId: { in: ids }, channel, status: "SCHEDULED" }, data: { status: "SKIPPED", skipReason: "opted_out" } });
    await db.reviewRequest.updateMany({ where: { contactId: { in: ids }, channel, remindedAt: null }, data: { reminderScheduledAt: null } });
  }
  return { contacts: ids.length };
}

/** Unsubscribe link in a message: /u/{token}. Works across tenants, so it starts from the system client. */
export async function optOutByToken(token: string) {
  const rr = await systemDb().reviewRequest.findUnique({
    where: { token },
    include: { contact: true, location: { select: { name: true } } },
  });
  if (!rr) return null;
  const value = rr.channel === "EMAIL" ? rr.contact.email : rr.contact.phone;
  if (value) await optOut(rr.organizationId, rr.channel, value, rr.channel === "SMS" ? "STOP" : "UNSUBSCRIBE", "unsubscribe-link");
  return { businessName: rr.location.name, channel: rr.channel };
}

export async function lookupUnsubscribe(token: string) {
  const rr = await systemDb().reviewRequest.findUnique({ where: { token }, include: { location: { select: { name: true } } } });
  return rr ? { businessName: rr.location.name, channel: rr.channel } : null;
}
