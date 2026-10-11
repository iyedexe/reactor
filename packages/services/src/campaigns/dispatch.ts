import type { MessagingAdapter } from "@avis/adapters";
import { forTenant, type TenantDb } from "@avis/db";
import { systemDb } from "@avis/db/system";
import { DAY } from "@avis/core/dates";
import { env, linksBaseUrl } from "@avis/core/env";
import { isSendAllowed, nextAllowedSendTime } from "@avis/core/quiet-hours";
import { DEFAULT_TEMPLATES } from "@avis/core/templates";
import { effectiveConsent, isSuppressed, type Channel } from "./optout.ts";
import { renderEmail, renderSms } from "./render.ts";

/** A visit older than this is not worth a review request anymore (e.g. after a long pause). */
export const MAX_REQUEST_AGE_DAYS = 30;

export type DispatchOutcome = "sent" | "rescheduled" | "skipped" | "failed" | "noop";

/** Template resolution: the organization's own template, then the campaign's, then the shared default. */
export async function templateFor(db: TenantDb, channel: Channel, kind: "REQUEST" | "REMINDER", templateId: string | null | undefined) {
  const own = await db.messageTemplate.findFirst({ where: { organizationId: db.organizationId, channel, kind }, orderBy: { updatedAt: "desc" } });
  if (own) return own;
  if (templateId && kind === "REQUEST") {
    const t = await db.messageTemplate.findFirst({ where: { id: templateId, channel } });
    if (t) return t;
  }
  const shared = await db.messageTemplate.findFirst({ where: { organizationId: null, channel, kind } });
  if (shared) return shared;
  const def = DEFAULT_TEMPLATES.find((t) => t.channel === channel && t.kind === kind)!;
  return { subject: def.subject, body: def.body };
}

/**
 * Sends one due request or reminder. Every rule is re-checked at send time, because things change between
 * scheduling and sending: subscription, campaign state, consent, opt-outs, quiet hours.
 */
export async function dispatchRequest(messaging: MessagingAdapter, organizationId: string, requestId: string, kind: "REQUEST" | "REMINDER", now = new Date()): Promise<DispatchOutcome> {
  const db = forTenant({ organizationId });
  const rr = await db.reviewRequest.findUnique({
    where: { id: requestId },
    include: { contact: { include: { consents: true } }, campaign: true, location: true },
  });
  if (!rr) return "noop";
  const skip = async (reason: string) => {
    if (kind === "REQUEST") await db.reviewRequest.updateMany({ where: { id: rr.id, status: "SCHEDULED" }, data: { status: "SKIPPED", skipReason: reason } });
    else await db.reviewRequest.update({ where: { id: rr.id }, data: { reminderScheduledAt: null } });
    return "skipped" as const;
  };

  if (kind === "REQUEST" && rr.status !== "SCHEDULED") return "noop";
  if (kind === "REMINDER" && (rr.status !== "SENT" || rr.remindedAt || rr.clickedAt || rr.attributedReviewId)) return "noop";

  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (org.serviceState !== "ACTIVE") return skip("service_suspended");
  if (!rr.campaign || rr.campaign.status !== "ACTIVE") return skip("campaign_inactive");
  if (kind === "REMINDER" && !rr.campaign.reminderEnabled) return skip("reminder_disabled");
  const ref = rr.visitAt ?? rr.createdAt;
  if (kind === "REQUEST" && now.getTime() - ref.getTime() > MAX_REQUEST_AGE_DAYS * DAY) return skip("too_old");

  const channel = rr.channel;
  const to = channel === "SMS" ? rr.contact.phone : rr.contact.email;
  if (!to) return skip("no_destination");
  if (!effectiveConsent(rr.contact.consents, channel)) return skip("no_consent");
  if (await isSuppressed(db, channel, to)) return skip("opted_out");

  if (!isSendAllowed(now, channel, { tz: rr.location.timezone })) {
    const next = nextAllowedSendTime(now, channel, { tz: rr.location.timezone });
    await db.reviewRequest.update({ where: { id: rr.id }, data: kind === "REQUEST" ? { scheduledAt: next } : { reminderScheduledAt: next } });
    return "rescheduled";
  }

  // Claim the row first so a request can never be sent twice (max one request + one reminder).
  const claimed =
    kind === "REQUEST"
      ? await db.reviewRequest.updateMany({ where: { id: rr.id, status: "SCHEDULED", sentAt: null }, data: { status: "SENT", sentAt: now } })
      : await db.reviewRequest.updateMany({ where: { id: rr.id, status: "SENT", remindedAt: null, clickedAt: null }, data: { status: "REMINDED", remindedAt: now, reminderScheduledAt: null } });
  if (claimed.count === 0) return "noop";

  const e = env();
  const ctx = {
    firstName: rr.contact.firstName,
    businessName: rr.location.name,
    reviewLink: `${linksBaseUrl(e)}/m/${rr.token}`,
    unsubscribeLink: `${linksBaseUrl(e)}/u/${rr.token}`,
    oneClickUnsubscribeUrl: `${e.APP_URL.replace(/\/$/, "")}/api/unsubscribe/${rr.token}`,
  };
  const tpl = await templateFor(db, channel, kind, channel === "SMS" ? rr.campaign.smsTemplateId : rr.campaign.emailTemplateId);
  const msg = channel === "SMS" ? renderSms(tpl.body, ctx, to) : renderEmail(tpl.subject ?? "", tpl.body, ctx, to);
  const message = await db.message.create({
    data: {
      organizationId,
      channel,
      kind,
      to,
      subject: "subject" in msg ? msg.subject : null,
      body: "text" in msg ? msg.text : msg.body,
      provider: messaging.provider,
      reviewRequestId: rr.id,
    },
  });
  try {
    const res = channel === "SMS" ? await messaging.sendSms(msg as Parameters<MessagingAdapter["sendSms"]>[0]) : await messaging.sendEmail(msg as Parameters<MessagingAdapter["sendEmail"]>[0]);
    await db.message.update({ where: { id: message.id }, data: { status: "SENT", provider: res.provider, providerMessageId: res.providerMessageId, sentAt: now } });
  } catch (err) {
    await db.message.update({ where: { id: message.id }, data: { status: "FAILED", error: String(err).slice(0, 500) } });
    if (kind === "REQUEST") await db.reviewRequest.update({ where: { id: rr.id }, data: { status: "FAILED", skipReason: "send_error" } });
    return "failed";
  }

  if (kind === "REQUEST" && rr.campaign.reminderEnabled) {
    const due = new Date(now.getTime() + rr.campaign.reminderAfterDays * DAY);
    await db.reviewRequest.update({ where: { id: rr.id }, data: { reminderScheduledAt: nextAllowedSendTime(due, channel, { tz: rr.location.timezone }) } });
  }
  return "sent";
}

/** Worker entry point: everything due across all organizations (system-level fan-out, tenant-scoped writes). */
export async function dispatchDue(messaging: MessagingAdapter, now = new Date(), limit = 200) {
  const db = systemDb();
  const [requests, reminders] = await Promise.all([
    db.reviewRequest.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } }, select: { id: true, organizationId: true }, take: limit, orderBy: { scheduledAt: "asc" } }),
    db.reviewRequest.findMany({
      where: { status: "SENT", remindedAt: null, clickedAt: null, attributedReviewId: null, reminderScheduledAt: { lte: now } },
      select: { id: true, organizationId: true },
      take: limit,
      orderBy: { reminderScheduledAt: "asc" },
    }),
  ]);
  const counts: Record<DispatchOutcome, number> = { sent: 0, rescheduled: 0, skipped: 0, failed: 0, noop: 0 };
  for (const r of requests) counts[await dispatchRequest(messaging, r.organizationId, r.id, "REQUEST", now)]++;
  for (const r of reminders) counts[await dispatchRequest(messaging, r.organizationId, r.id, "REMINDER", now)]++;
  return counts;
}
