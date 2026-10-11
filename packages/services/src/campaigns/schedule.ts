import type { TenantDb } from "@avis/db";
import { randomToken } from "@avis/core/crypto";
import { HOUR } from "@avis/core/dates";
import { nextAllowedSendTime } from "@avis/core/quiet-hours";
import { effectiveConsent, isSuppressed, type Channel } from "./optout.ts";

export type ScheduleOutcome =
  | { status: "scheduled"; requestId: string; channel: Channel; scheduledAt: Date }
  | { status: "exists"; requestId: string }
  | { status: "skipped"; reason: "no_campaign" | "no_consent" | "no_destination" | "opted_out" | "service_suspended" };

/**
 * Schedules the review request that follows a visit. Same message for every customer (no segmentation by
 * expected satisfaction). At most one request per customer and location, ever (DB unique constraint);
 * consent, opt-outs and quiet hours are checked again at send time.
 */
export async function scheduleRequestForVisit(db: TenantDb, contactId: string, visitAt: Date, opts: { campaignId?: string; now?: Date } = {}): Promise<ScheduleOutcome> {
  const contact = await db.contact.findUniqueOrThrow({ where: { id: contactId }, include: { consents: true } });
  const existing = await db.reviewRequest.findUnique({ where: { contactId_locationId: { contactId, locationId: contact.locationId } } });
  if (existing) return { status: "exists", requestId: existing.id };

  const org = await db.organization.findUniqueOrThrow({ where: { id: db.organizationId } });
  if (org.serviceState !== "ACTIVE") return { status: "skipped", reason: "service_suspended" };

  const campaign = opts.campaignId
    ? await db.campaign.findFirst({ where: { id: opts.campaignId, locationId: contact.locationId, status: "ACTIVE" } })
    : await db.campaign.findFirst({ where: { locationId: contact.locationId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!campaign) return { status: "skipped", reason: "no_campaign" };

  // Channel: SMS first when allowed (higher open rate), else e-mail. Same rule for everyone.
  const order: Channel[] = ["SMS", "EMAIL"];
  let chosen: Channel | null = null;
  let sawDestination = false;
  let sawConsent = false;
  for (const ch of order) {
    if (!campaign.channels.includes(ch)) continue;
    const dest = ch === "SMS" ? contact.phone : contact.email;
    if (!dest) continue;
    sawDestination = true;
    if (!effectiveConsent(contact.consents, ch)) continue;
    sawConsent = true;
    if (await isSuppressed(db, ch, dest)) continue;
    chosen = ch;
    break;
  }
  if (!chosen) return { status: "skipped", reason: !sawDestination ? "no_destination" : !sawConsent ? "no_consent" : "opted_out" };

  const now = opts.now ?? new Date();
  const due = new Date(Math.max(visitAt.getTime() + campaign.delayAfterVisitHours * HOUR, now.getTime()));
  const location = await db.location.findUniqueOrThrow({ where: { id: contact.locationId } });
  const scheduledAt = nextAllowedSendTime(due, chosen, { tz: location.timezone });
  const rr = await db.reviewRequest.create({
    data: {
      organizationId: db.organizationId,
      locationId: contact.locationId,
      contactId,
      campaignId: campaign.id,
      token: randomToken(12),
      channel: chosen,
      visitAt,
      scheduledAt,
    },
  });
  await db.contact.update({ where: { id: contactId }, data: { lastVisitAt: visitAt } });
  return { status: "scheduled", requestId: rr.id, channel: chosen, scheduledAt };
}
