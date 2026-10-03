import { randomUUID } from "node:crypto";
import { prisma, type RawPrisma } from "./client.ts";

/** Test helpers. Never import from application code. */

export async function resetDatabase(db: RawPrisma = prisma()): Promise<void> {
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
}

export interface TenantFixture {
  organizationId: string;
  userId: string;
  ids: Record<string, string>;
}

/** Creates an organization with exactly one row in every tenant-owned table. */
export async function createTenantFixture(label: string, db: RawPrisma = prisma()): Promise<TenantFixture> {
  const u = randomUUID().slice(0, 8);
  const organizationId = `org_${label}_${u}`;
  const userId = `usr_${label}_${u}`;
  const ids: Record<string, string> = {};

  await db.user.create({ data: { id: userId, name: `Owner ${label}`, email: `owner-${label}-${u}@example.test` } });
  await db.organization.create({ data: { id: organizationId, name: `Org ${label}`, slug: `org-${label}-${u}`, onboardedAt: new Date() } });
  ids.Organization = organizationId;

  const member = await db.member.create({ data: { id: `mem_${label}_${u}`, organizationId, userId, role: "owner" } });
  ids.Member = member.id;
  ids.Invitation = (
    await db.invitation.create({
      data: { id: `inv_${label}_${u}`, organizationId, email: `staff-${u}@example.test`, role: "staff", inviterId: userId, expiresAt: new Date(Date.now() + 86_400_000) },
    })
  ).id;
  ids.NotificationPref = (await db.notificationPref.create({ data: { organizationId, memberId: member.id } })).id;

  const location = await db.location.create({ data: { organizationId, name: `Loc ${label}`, category: "restaurant" } });
  ids.Location = location.id;
  const locationId = location.id;

  ids.BaselineSnapshot = (
    await db.baselineSnapshot.create({
      data: { organizationId, locationId, capturedAt: new Date(), rating: 4.1, reviewCount: 50, velocityPerWeek: 1, responseRate: 0.2 },
    })
  ).id;
  ids.LocationDailyStat = (
    await db.locationDailyStat.create({ data: { organizationId, locationId, date: new Date("2026-01-01"), totalReviews: 50 } })
  ).id;
  const stand = await db.stand.create({ data: { code: `c${u}`, organizationId, locationId, status: "ACTIVE" } });
  ids.Stand = stand.id;
  ids.LinkEvent = (await db.linkEvent.create({ data: { organizationId, locationId, standId: stand.id, type: "SCAN" } })).id;
  ids.PrivateFeedback = (await db.privateFeedback.create({ data: { organizationId, locationId, message: "secret feedback" } })).id;

  const review = await db.review.create({
    data: {
      organizationId,
      locationId,
      googleReviewId: `g_${u}`,
      authorName: "Jean D.",
      rating: 2,
      comment: "Bof",
      createdAtGoogle: new Date(),
      updatedAtGoogle: new Date(),
    },
  });
  ids.Review = review.id;
  ids.ReviewSyncState = (await db.reviewSyncState.create({ data: { organizationId, locationId } })).id;
  ids.ReplySettings = (await db.replySettings.create({ data: { organizationId, locationId } })).id;
  const reply = await db.reviewReply.create({ data: { organizationId, reviewId: review.id, body: "Merci", status: "DRAFT", origin: "AI" } });
  ids.ReviewReply = reply.id;
  ids.ReplyRevision = (await db.replyRevision.create({ data: { organizationId, replyId: reply.id, action: "GENERATED", body: "Merci" } })).id;
  ids.ReviewClassification = (
    await db.reviewClassification.create({ data: { organizationId, reviewId: review.id, category: "NONE", confidence: 0.9, explanation: "ok" } })
  ).id;
  ids.ViolationReport = (
    await db.violationReport.create({ data: { organizationId, reviewId: review.id, category: "SPAM_FAKE", reasonText: "r", explanation: "e" } })
  ).id;

  const contact = await db.contact.create({
    data: { organizationId, locationId, firstName: "Marie", email: `marie-${u}@example.test`, source: "MANUAL" },
  });
  ids.Contact = contact.id;
  ids.ConsentEvent = (
    await db.consentEvent.create({ data: { organizationId, contactId: contact.id, channel: "EMAIL", action: "GRANTED", source: "test" } })
  ).id;
  ids.Suppression = (await db.suppression.create({ data: { organizationId, channel: "SMS", valueHash: `h_${u}`, reason: "STOP" } })).id;
  ids.MessageTemplate = (
    await db.messageTemplate.create({ data: { organizationId, channel: "EMAIL", kind: "REQUEST", name: "t", subject: "s", body: "b" } })
  ).id;
  const campaign = await db.campaign.create({ data: { organizationId, locationId, name: "c", channels: ["EMAIL"] } });
  ids.Campaign = campaign.id;
  const request = await db.reviewRequest.create({
    data: { organizationId, locationId, contactId: contact.id, campaignId: campaign.id, token: `t${u}`, channel: "EMAIL", scheduledAt: new Date() },
  });
  ids.ReviewRequest = request.id;
  ids.Message = (
    await db.message.create({
      data: { organizationId, channel: "EMAIL", kind: "REQUEST", to: contact.email!, body: "b", provider: "console", reviewRequestId: request.id },
    })
  ).id;
  ids.InboundWebhook = (await db.inboundWebhook.create({ data: { organizationId, locationId, name: "booking", tokenHash: `th_${u}` } })).id;
  const competitor = await db.competitor.create({ data: { organizationId, locationId, placeId: `p_${u}`, name: "Rival" } });
  ids.Competitor = competitor.id;
  ids.CompetitorSnapshot = (
    await db.competitorSnapshot.create({ data: { organizationId, competitorId: competitor.id, date: new Date("2026-01-01"), rating: 4, reviewCount: 10 } })
  ).id;
  ids.Subscription = (await db.subscription.create({ data: { organizationId, plan: "PRO", status: "ACTIVE" } })).id;
  ids.StoredFile = (
    await db.storedFile.create({ data: { organizationId, kind: "LOGO", storageKey: `k_${u}`, filename: "logo.png", mime: "image/png", size: 1 } })
  ).id;
  ids.MonthlyReport = (await db.monthlyReport.create({ data: { organizationId, month: new Date("2026-01-01") } })).id;
  ids.AuditLog = (await db.auditLog.create({ data: { organizationId, action: "test" } })).id;

  return { organizationId, userId, ids };
}
