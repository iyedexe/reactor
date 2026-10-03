import { randomUUID } from "node:crypto";
import { TZDate } from "@date-fns/tz";
import { fakerFR as faker } from "@faker-js/faker";
import { hashPassword } from "better-auth/crypto";
import type { Prisma } from "@avis/db";
import type { RawPrisma } from "@avis/db/system";
import { DAY, HOUR, keyedHash, googleWriteReviewUrl, detectTopics, DEFAULT_TEMPLATES, randomCode, randomToken } from "@avis/core";
import { captureBaseline, rollupLocation } from "@avis/services";
import { ADMIN_DEFAULT_EMAIL, ADMIN_DEFAULT_PASSWORD, BUSINESSES, DEMO_PASSWORD, type BusinessDef, type LocationDef } from "./businesses.ts";
import { FEEDBACK_MESSAGES, replyText, reviewText, VIOLATIONS } from "./content.ts";
import { Rng } from "./rng.ts";

const TZ = "Europe/Paris";
const WINDOW_DAYS = 365;

interface Ctx {
  db: RawPrisma;
  rng: Rng;
  now: Date;
  secret: string;
  log: (msg: string) => void;
}

/** Paris-local wall-clock time on the given day. */
function parisTime(day: Date, hour: number, minute = 0): Date {
  const d = new TZDate(day.getTime(), TZ);
  return new Date(new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, TZ).getTime());
}

function parisWeekday(d: Date): number {
  return new TZDate(d.getTime(), TZ).getDay();
}

function parisHour(d: Date): number {
  return new TZDate(d.getTime(), TZ).getHours();
}

/** Next instant within quiet-hours rules (Mon–Sat, 9:00–20:00 Paris). Simplified copy for seeding. */
function allowedSendTime(t: Date): Date {
  let d = t;
  for (let i = 0; i < 8; i++) {
    const h = parisHour(d);
    if (parisWeekday(d) !== 0 && h >= 9 && h < 20) return d;
    d = h >= 20 || parisWeekday(d) === 0 ? parisTime(new Date(d.getTime() + DAY), 9, 30) : parisTime(d, 9, 30);
  }
  return d;
}

function displayName(rng: Rng): { display: string; first: string; last: string } {
  const first = faker.person.firstName();
  const last = faker.person.lastName();
  const display = rng.chance(0.55) ? `${first} ${last.charAt(0)}.` : rng.chance(0.8) ? `${first} ${last}` : first;
  return { display, first, last };
}

function weightedStar(rng: Rng, weights: readonly (readonly [number, number])[]): number {
  return rng.weighted(weights);
}

export async function seedAll(ctx: Ctx): Promise<void> {
  const { db } = ctx;
  faker.seed(42);

  // System default templates
  await db.messageTemplate.createMany({
    data: DEFAULT_TEMPLATES.map((t) => ({ organizationId: null, channel: t.channel, kind: t.kind, name: t.name, subject: t.subject, body: t.body })),
  });

  // Platform admin
  const adminEmail = process.env.ADMIN_EMAIL ?? ADMIN_DEFAULT_EMAIL;
  await createUser(db, { name: "Admin AvisBoost", email: adminEmail, password: process.env.ADMIN_PASSWORD ?? ADMIN_DEFAULT_PASSWORD, role: "admin" });

  // Stand stock (not yet assigned to any client)
  await db.stand.createMany({
    data: Array.from({ length: 12 }, () => ({ code: randomCode(8), status: "UNASSIGNED" as const })),
  });

  for (const biz of BUSINESSES) {
    ctx.log(`• ${biz.name}`);
    await seedBusiness(ctx, biz);
  }
}

async function createUser(db: RawPrisma, u: { name: string; email: string; password: string; role?: string; phone?: string }) {
  const id = randomUUID();
  await db.user.create({ data: { id, name: u.name, email: u.email, emailVerified: true, role: u.role ?? "user", phone: u.phone } });
  await db.account.create({
    data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(u.password) },
  });
  return id;
}

async function seedBusiness(ctx: Ctx, biz: BusinessDef) {
  const { db, rng, now } = ctx;
  const joinedAt = parisTime(new Date(now.getTime() - biz.joinedDaysAgo * DAY), 10, 0);
  const orgId = randomUUID();

  await db.organization.create({
    data: { id: orgId, name: biz.name, slug: biz.slug, onboardedAt: joinedAt, billingEmail: biz.owner.email, createdAt: new Date(joinedAt.getTime() - 3 * DAY) },
  });
  const ownerId = await createUser(db, { ...biz.owner, password: DEMO_PASSWORD });
  const staffId = await createUser(db, { ...biz.staff, password: DEMO_PASSWORD });
  const ownerMember = await db.member.create({ data: { id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner", createdAt: joinedAt } });
  const staffMember = await db.member.create({ data: { id: randomUUID(), organizationId: orgId, userId: staffId, role: "staff", createdAt: joinedAt } });
  await db.notificationPref.createMany({
    data: [
      { organizationId: orgId, memberId: ownerMember.id, alertEmail: true, alertSms: true, alertPhone: biz.owner.phone },
      { organizationId: orgId, memberId: staffMember.id, alertEmail: true, alertSms: false, monthlyReport: false },
    ],
  });

  const trialEnd = new Date(joinedAt.getTime() + 30 * DAY);
  await db.subscription.create({
    data: {
      organizationId: orgId,
      plan: biz.plan,
      status: biz.subscriptionStatus,
      stripeCustomerId: `cus_demo_${biz.slug.replace(/-/g, "")}`,
      stripeSubscriptionId: `sub_demo_${biz.slug.replace(/-/g, "")}`,
      trialEndsAt: trialEnd,
      currentPeriodEnd: new Date(now.getTime() + rng.int(3, 27) * DAY),
      setupFeePaidAt: joinedAt,
      createdAt: joinedAt,
    },
  });

  for (const [i, loc] of biz.locations.entries()) {
    ctx.log(`  – ${loc.name}`);
    await seedLocation(ctx, biz, loc, orgId, joinedAt, ownerId, staffId, i);
  }

  await db.auditLog.createMany({
    data: [
      { organizationId: orgId, actorUserId: ownerId, action: "org.onboarded", createdAt: joinedAt },
      { organizationId: orgId, actorUserId: ownerId, action: "reply_settings.update", entity: "ReplySettings", createdAt: new Date(joinedAt.getTime() + 2 * DAY) },
    ],
  });
}

interface SeedReview {
  id: string;
  googleReviewId: string;
  author: { display: string; first: string; last: string };
  rating: number;
  comment: string | null;
  language: "fr" | "en";
  createdAt: Date;
  violation?: { index: number; status: "TO_SUBMIT" | "SUBMITTED" | "REMOVED" | "REJECTED" };
  fromCampaign?: boolean;
}

async function seedLocation(
  ctx: Ctx,
  biz: BusinessDef,
  def: LocationDef,
  orgId: string,
  joinedAt: Date,
  ownerId: string,
  staffId: string,
  index: number,
) {
  const { db, rng, now } = ctx;
  const locationId = randomUUID();
  const gbpLocationId = `locations/${biz.slug}-${def.key}`;
  const gbpAccountId = "accounts/avisboost-demo";
  const placeId = `ChIJdemo_${biz.slug.replace(/-/g, "")}_${def.key}`;

  await db.location.create({
    data: {
      id: locationId,
      organizationId: orgId,
      name: def.name,
      address: def.address,
      postalCode: def.postalCode,
      city: def.city,
      category: biz.kind,
      latitude: def.lat,
      longitude: def.lng,
      brandColor: biz.brandColor,
      gbpAccountId,
      gbpLocationId,
      placeId,
      googleReviewUrl: googleWriteReviewUrl(placeId),
      createdAt: joinedAt,
    },
  });
  await db.mockGbpLocation.create({ data: { gbpLocationId, accountId: gbpAccountId, title: def.name, placeId } });
  await db.replySettings.create({
    data: {
      organizationId: orgId,
      locationId,
      tone: biz.tone,
      signature: biz.signature,
      alwaysMention: biz.alwaysMention,
      neverMention: biz.neverMention,
      autoPublishMinStars: 4,
    },
  });

  // ── Reviews ──────────────────────────────────────────────────────────
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const reviews: SeedReview[] = [];
  const mk = (rating: number, createdAt: Date, text = reviewText(rng, biz.kind, rating, def.englishShare)): SeedReview => ({
    id: randomUUID(),
    googleReviewId: `AbFvO${randomCode(18)}`,
    author: displayName(rng),
    rating,
    comment: text.comment,
    language: text.language,
    createdAt,
  });

  // Older history (before the 12-month window), spread over two years.
  for (let i = 0; i < def.olderReviews; i++) {
    const t = new Date(windowStart.getTime() - rng.float(1, 730) * DAY);
    reviews.push(mk(weightedStar(rng, def.preStars), parisTime(t, rng.int(biz.hours[0], biz.hours[1] - 1) + 1, rng.int(0, 59))));
  }
  // Last 12 months, day by day. After joining, velocity ramps up over ~3 weeks.
  for (let d = 0; d <= WINDOW_DAYS; d++) {
    const day = new Date(windowStart.getTime() + d * DAY);
    const sinceJoin = (day.getTime() - joinedAt.getTime()) / DAY;
    const ramp = sinceJoin < 0 ? 0 : Math.min(1, sinceJoin / 21);
    const weekly = def.preRate + (def.postRate - def.preRate) * ramp;
    const weekdayBoost = [1.3, 0.8, 0.8, 0.9, 1.0, 1.2, 1.4][parisWeekday(day)]!;
    const n = rng.poisson((weekly / 7) * weekdayBoost);
    for (let k = 0; k < n; k++) {
      const t = parisTime(day, rng.int(biz.hours[0] + 1, Math.min(23, biz.hours[1] + 2)), rng.int(0, 59));
      if (t > now) continue;
      reviews.push(mk(weightedStar(rng, sinceJoin < 0 ? def.preStars : def.postStars), t));
    }
  }
  // Planted policy violations, spread over the period since joining.
  for (const [vi, v] of def.violations.entries()) {
    const spec = VIOLATIONS[v.index]!;
    const t = new Date(joinedAt.getTime() + ((vi + 1) / (def.violations.length + 1)) * (now.getTime() - joinedAt.getTime()));
    reviews.push({ ...mk(spec.rating, t, { comment: spec.comment, language: "fr" }), violation: v });
  }
  reviews.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const reviewRows: Prisma.ReviewCreateManyInput[] = [];
  const mockRows: Prisma.MockGbpReviewCreateManyInput[] = [];
  const replyRows: Prisma.ReviewReplyCreateManyInput[] = [];
  const revisionRows: Prisma.ReplyRevisionCreateManyInput[] = [];
  const classRows: Prisma.ReviewClassificationCreateManyInput[] = [];
  const violationRows: Prisma.ViolationReportCreateManyInput[] = [];

  for (const r of reviews) {
    const after = r.createdAt >= joinedAt;
    const ageH = (now.getTime() - r.createdAt.getTime()) / HOUR;
    const removed = r.violation?.status === "REMOVED";
    let replyState: "UNANSWERED" | "DRAFTED" | "PENDING_APPROVAL" | "ANSWERED" = "UNANSWERED";
    let firstRepliedAt: Date | null = null;

    const replyBody = replyText(rng, r.rating, r.author.first, r.language, biz.signature);
    let publishedReply: string | null = null;

    if (r.violation) {
      // Owners don't reply to reviews they report.
    } else if (!after) {
      // Before AvisBoost: owner replied by hand to a few reviews, days later.
      if (rng.chance(0.18)) {
        firstRepliedAt = new Date(r.createdAt.getTime() + rng.float(20, 240) * HOUR);
        if (firstRepliedAt < now) {
          replyState = "ANSWERED";
          publishedReply = `Merci ${r.author.first} pour votre avis.`;
          const id = randomUUID();
          replyRows.push({ id, organizationId: orgId, reviewId: r.id, body: publishedReply, status: "PUBLISHED", origin: "EXTERNAL", publishedAt: firstRepliedAt, createdAt: firstRepliedAt });
          revisionRows.push({ organizationId: orgId, replyId: id, action: "SYNCED", body: publishedReply, createdAt: firstRepliedAt });
        } else firstRepliedAt = null;
      }
    } else if (r.rating >= 4) {
      // Auto-published AI reply, 1–6 hours after the review (the newest ones are still in the queue).
      const at = new Date(r.createdAt.getTime() + rng.float(0.5, 6) * HOUR);
      const id = randomUUID();
      if (at < now) {
        replyState = "ANSWERED";
        firstRepliedAt = at;
        publishedReply = replyBody;
        replyRows.push({ id, organizationId: orgId, reviewId: r.id, body: replyBody, status: "PUBLISHED", origin: "AI", model: "claude", promptVersion: "reply-v1", publishedAt: at, createdAt: new Date(at.getTime() - 10 * 60_000) });
        revisionRows.push(
          { organizationId: orgId, replyId: id, action: "GENERATED", body: replyBody, createdAt: new Date(at.getTime() - 10 * 60_000) },
          { organizationId: orgId, replyId: id, action: "PUBLISHED", body: replyBody, createdAt: at },
        );
      } else {
        replyState = "DRAFTED"; // auto-publish pending
        replyRows.push({ id, organizationId: orgId, reviewId: r.id, body: replyBody, status: "DRAFT", origin: "AI", model: "claude", promptVersion: "reply-v1", createdAt: new Date(r.createdAt.getTime() + 5 * 60_000) });
        revisionRows.push({ organizationId: orgId, replyId: id, action: "GENERATED", body: replyBody, createdAt: new Date(r.createdAt.getTime() + 5 * 60_000) });
      }
    } else {
      // 1–3★: AI draft queued for approval; owner approves (sometimes edits) within a day or two.
      const draftAt = new Date(r.createdAt.getTime() + 5 * 60_000);
      const id = randomUUID();
      const approveAt = new Date(r.createdAt.getTime() + rng.float(3, 40) * HOUR);
      revisionRows.push({ organizationId: orgId, replyId: id, action: "GENERATED", body: replyBody, createdAt: draftAt });
      // Recent ones are often still waiting for the owner, so the approval queue has something in it.
      const stillWaiting = ageH < 24 * 12 && rng.chance(0.5);
      if (approveAt < now && ageH > 30 && !stillWaiting) {
        const edited = rng.chance(0.4);
        const body = edited ? replyBody.replace("Bonjour", "Bonjour et merci") : replyBody;
        const actor = rng.chance(0.75) ? ownerId : staffId;
        if (edited) revisionRows.push({ organizationId: orgId, replyId: id, action: "EDITED", body, actorUserId: actor, createdAt: new Date(approveAt.getTime() - 5 * 60_000) });
        revisionRows.push(
          { organizationId: orgId, replyId: id, action: "APPROVED", body, actorUserId: actor, createdAt: approveAt },
          { organizationId: orgId, replyId: id, action: "PUBLISHED", body, actorUserId: actor, createdAt: approveAt },
        );
        replyRows.push({ id, organizationId: orgId, reviewId: r.id, body, status: "PUBLISHED", origin: edited ? "HUMAN" : "AI", model: "claude", promptVersion: "reply-v1", publishedAt: approveAt, publishedById: actor, createdAt: draftAt });
        replyState = "ANSWERED";
        firstRepliedAt = approveAt;
        publishedReply = body;
      } else {
        replyRows.push({ id, organizationId: orgId, reviewId: r.id, body: replyBody, status: "PENDING_APPROVAL", origin: "AI", model: "claude", promptVersion: "reply-v1", createdAt: draftAt });
        replyState = "PENDING_APPROVAL";
      }
    }

    reviewRows.push({
      id: r.id,
      organizationId: orgId,
      locationId,
      googleReviewId: r.googleReviewId,
      authorName: r.author.display,
      rating: r.rating,
      comment: r.comment,
      language: r.language,
      createdAtGoogle: r.createdAt,
      updatedAtGoogle: r.createdAt,
      removedAt: removed ? new Date(r.createdAt.getTime() + 9 * DAY) : null,
      sentiment: Math.round(((r.rating - 3) / 2 + rng.float(-0.15, 0.15)) * 100) / 100,
      topics: detectTopics(r.comment),
      replyState,
      firstRepliedAt,
      createdAt: r.createdAt,
    });
    mockRows.push({
      gbpLocationId,
      reviewId: r.googleReviewId,
      reviewerName: r.author.display,
      starRating: r.rating,
      comment: r.comment,
      createTime: r.createdAt,
      updateTime: r.createdAt,
      replyComment: publishedReply,
      replyUpdateTime: publishedReply ? firstRepliedAt : null,
      deleted: removed,
    });

    if (after && r.rating <= 3) {
      if (r.violation) {
        const spec = VIOLATIONS[r.violation.index]!;
        const explanation = {
          SPAM_FAKE: "L'avis fait la promotion d'un autre site avec un code de réduction : contenu publicitaire sans lien avec une visite.",
          PERSONAL_INFO: "L'avis publie le prénom et le numéro de téléphone d'une employée.",
          OFFENSIVE: "L'avis contient des insultes et accusations injurieuses envers le gérant.",
          OFF_TOPIC: "L'avis traite de politique, sans rapport avec l'expérience dans l'établissement.",
        }[spec.category];
        classRows.push({ organizationId: orgId, reviewId: r.id, category: spec.category, confidence: rng.float(0.78, 0.95), explanation, model: "claude", promptVersion: "classify-v1" });
        const submittedAt = new Date(r.createdAt.getTime() + 1.5 * DAY);
        violationRows.push({
          organizationId: orgId,
          reviewId: r.id,
          category: spec.category,
          reasonText: { SPAM_FAKE: "Spam", PERSONAL_INFO: "Informations personnelles", OFFENSIVE: "Contenu injurieux", OFF_TOPIC: "Hors sujet" }[spec.category],
          explanation,
          status: r.violation.status,
          submittedAt: r.violation.status === "TO_SUBMIT" ? null : submittedAt,
          submittedById: r.violation.status === "TO_SUBMIT" ? null : ownerId,
          resolvedAt: ["REMOVED", "REJECTED"].includes(r.violation.status) ? new Date(submittedAt.getTime() + 7 * DAY) : null,
          createdAt: new Date(r.createdAt.getTime() + 10 * 60_000),
        });
      } else {
        classRows.push({
          organizationId: orgId,
          reviewId: r.id,
          category: "NONE",
          confidence: rng.float(0.82, 0.97),
          explanation: "Avis authentique décrivant une expérience client : aucune règle de Google n'est enfreinte. Une réponse publique soignée est recommandée.",
          model: "claude",
          promptVersion: "classify-v1",
        });
      }
    }
  }

  await db.review.createMany({ data: reviewRows });
  await db.mockGbpReview.createMany({ data: mockRows });
  await db.reviewReply.createMany({ data: replyRows });
  await db.replyRevision.createMany({ data: revisionRows });
  await db.reviewClassification.createMany({ data: classRows });
  await db.violationReport.createMany({ data: violationRows });

  // ── Stands & link events ─────────────────────────────────────────────
  const standIds: string[] = [];
  for (const label of def.stands) {
    const s = await db.stand.create({
      data: { code: randomCode(8), organizationId: orgId, locationId, label, status: "ACTIVE", assignedAt: joinedAt, createdAt: joinedAt },
    });
    standIds.push(s.id);
  }
  const events: Prisma.LinkEventCreateManyInput[] = [];
  const feedbacks: Prisma.PrivateFeedbackCreateManyInput[] = [];
  const standWeights = standIds.map((id, i) => [id, i === 0 ? 3 : 1] as const);
  for (let t = joinedAt.getTime(); t < now.getTime(); t += DAY) {
    const day = new Date(t);
    if (!biz.openDays.includes(parisWeekday(day))) continue;
    const n = rng.poisson(def.scansPerDay * [1.3, 0.8, 0.8, 0.9, 1.0, 1.2, 1.4][parisWeekday(day)]!);
    for (let k = 0; k < n; k++) {
      const at = parisTime(day, rng.int(biz.hours[0], biz.hours[1] - 1), rng.int(0, 59));
      if (at > now) continue;
      const standId = rng.weighted(standWeights);
      const deviceType = rng.weighted([["MOBILE", 93], ["TABLET", 5], ["DESKTOP", 2]] as const);
      const os = deviceType === "DESKTOP" ? "Windows" : rng.chance(0.56) ? "iOS" : "Android";
      const source = rng.chance(0.62) ? "NFC" : "QR";
      const visitorHash = keyedHash(`${t}-${k}`, ctx.secret, "visitor").slice(0, 32);
      const base = { organizationId: orgId, locationId, standId, source, deviceType, os, visitorHash } as const;
      events.push({ ...base, type: "SCAN", occurredAt: at });
      const r = rng.next();
      if (r < 0.56) events.push({ ...base, type: "GOOGLE_CLICK", occurredAt: new Date(at.getTime() + rng.int(3, 40) * 1000) });
      else if (r < 0.64) {
        events.push({ ...base, type: "FEEDBACK_OPEN", occurredAt: new Date(at.getTime() + 5000) });
        if (rng.chance(0.55)) {
          const sentAt = new Date(at.getTime() + rng.int(40, 200) * 1000);
          events.push({ ...base, type: "FEEDBACK_SENT", occurredAt: sentAt });
          const wantsReply = rng.chance(0.4);
          const person = displayName(rng);
          feedbacks.push({
            organizationId: orgId,
            locationId,
            standId,
            message: rng.pick(FEEDBACK_MESSAGES),
            contactName: wantsReply ? `${person.first} ${person.last}` : null,
            contactEmail: wantsReply ? faker.internet.email({ firstName: person.first, lastName: person.last }).toLowerCase() : null,
            wantsReply,
            status: now.getTime() - sentAt.getTime() > 5 * DAY ? rng.weighted([["READ", 6], ["ARCHIVED", 3], ["NEW", 1]] as const) : "NEW",
            createdAt: sentAt,
          });
        }
      }
    }
  }

  // ── Contacts, consent, campaigns ─────────────────────────────────────
  const emailTpl = await db.messageTemplate.findFirstOrThrow({ where: { organizationId: null, channel: "EMAIL", kind: "REQUEST" } });
  const smsTpl = await db.messageTemplate.findFirstOrThrow({ where: { organizationId: null, channel: "SMS", kind: "REQUEST" } });
  const campaign = await db.campaign.create({
    data: {
      organizationId: orgId,
      locationId,
      name: biz.kind === "restaurant" ? "Après réservation" : "Après rendez-vous",
      channels: ["SMS", "EMAIL"],
      emailTemplateId: emailTpl.id,
      smsTemplateId: smsTpl.id,
      delayAfterVisitHours: biz.kind === "restaurant" ? 3 : 2,
      reminderAfterDays: 3,
      createdAt: joinedAt,
    },
  });

  const contacts: Prisma.ContactCreateManyInput[] = [];
  const consents: Prisma.ConsentEventCreateManyInput[] = [];
  const requests: Prisma.ReviewRequestCreateManyInput[] = [];
  const messages: Prisma.MessageCreateManyInput[] = [];
  const suppressions: Prisma.SuppressionCreateManyInput[] = [];
  const usedEmails = new Set<string>();
  const usedPhones = new Set<string>();

  // Reviews that came from a campaign: the review author is the contact (name-match attribution).
  const postReviews = reviews.filter((r) => r.createdAt >= new Date(joinedAt.getTime() + 2 * DAY) && !r.violation && r.createdAt < now);
  const campaignShare = biz.kind === "restaurant" ? 0.22 : 0.45;
  const converted = postReviews.filter(() => rng.chance(campaignShare));

  const addContact = (visitAt: Date, person = displayName(rng), review?: SeedReview) => {
    const id = randomUUID();
    const channel = rng.chance(0.65) ? "SMS" : "EMAIL";
    let email: string | null = faker.internet.email({ firstName: person.first, lastName: person.last }).toLowerCase();
    let phone: string | null = `+336${String(rng.int(10_000_000, 99_999_999))}`;
    if (usedEmails.has(email)) email = null;
    if (usedPhones.has(phone)) phone = null;
    if (email) usedEmails.add(email);
    if (phone) usedPhones.add(phone);
    if (channel === "EMAIL" && !email) return;
    if (channel === "SMS" && !phone) return;
    const source = rng.weighted([["WEBHOOK", 6], ["CSV", 3], ["MANUAL", 1]] as const);
    contacts.push({ id, organizationId: orgId, locationId, firstName: person.first, lastName: person.last, email, phone, source, lastVisitAt: visitAt, createdAt: visitAt });

    const consentGiven = review ? true : rng.chance(0.93);
    consents.push({
      organizationId: orgId,
      contactId: id,
      channel,
      action: consentGiven ? "GRANTED" : "WITHDRAWN",
      source: source === "WEBHOOK" ? "webhook:booking" : source === "CSV" ? "csv:import" : `manual:${ownerId}`,
      evidence: consentGiven ? "Case cochée lors de la réservation : « J'accepte d'être recontacté(e) après ma visite »" : null,
      createdAt: visitAt,
    });

    const token = randomToken(12);
    const scheduledAt = allowedSendTime(new Date(visitAt.getTime() + campaign.delayAfterVisitHours * HOUR));
    const reqId = randomUUID();
    if (!consentGiven) {
      requests.push({ id: reqId, organizationId: orgId, locationId, contactId: id, campaignId: campaign.id, token, channel, visitAt, scheduledAt, status: "SKIPPED", skipReason: "no_consent", createdAt: visitAt });
      return;
    }
    if (scheduledAt > now) {
      requests.push({ id: reqId, organizationId: orgId, locationId, contactId: id, campaignId: campaign.id, token, channel, visitAt, scheduledAt, status: "SCHEDULED", createdAt: visitAt });
      return;
    }
    const to = channel === "SMS" ? phone! : email!;
    const failed = !review && rng.chance(0.03);
    const body = channel === "SMS" ? `Bonjour ${person.first}, merci pour votre visite chez ${biz.name} ! Votre avis nous aiderait beaucoup : https://avis.example/m/${token}\nSTOP au 36173` : `Bonjour ${person.first},\n\nMerci pour votre visite chez ${biz.name} ! Votre avis compte beaucoup pour nous.\nhttps://avis.example/m/${token}`;
    messages.push({
      organizationId: orgId,
      channel,
      kind: "REQUEST",
      to,
      subject: channel === "EMAIL" ? `${person.first}, comment s'est passée votre visite chez ${biz.name} ?` : null,
      body,
      provider: "brevo",
      providerMessageId: randomUUID(),
      status: failed ? (channel === "EMAIL" ? "BOUNCED" : "FAILED") : "DELIVERED",
      reviewRequestId: reqId,
      sentAt: scheduledAt,
      deliveredAt: failed ? null : new Date(scheduledAt.getTime() + 20_000),
      createdAt: scheduledAt,
    });
    if (failed) {
      requests.push({ id: reqId, organizationId: orgId, locationId, contactId: id, campaignId: campaign.id, token, channel, visitAt, scheduledAt, status: "FAILED", sentAt: scheduledAt, createdAt: visitAt });
      if (channel === "EMAIL") suppressions.push({ organizationId: orgId, channel, valueHash: keyedHash(to, ctx.secret, "suppression"), reason: "BOUNCE", createdAt: scheduledAt });
      return;
    }

    // Opt-out after the request (honoured: no reminder).
    if (!review && rng.chance(0.025)) {
      const at = new Date(scheduledAt.getTime() + rng.float(0.1, 5) * HOUR);
      consents.push({ organizationId: orgId, contactId: id, channel, action: "WITHDRAWN", source: channel === "SMS" ? "sms-stop" : "unsubscribe-link", createdAt: at });
      suppressions.push({ organizationId: orgId, channel, valueHash: keyedHash(to, ctx.secret, "suppression"), reason: channel === "SMS" ? "STOP" : "UNSUBSCRIBE", createdAt: at });
      requests.push({ id: reqId, organizationId: orgId, locationId, contactId: id, campaignId: campaign.id, token, channel, visitAt, scheduledAt, status: "SENT", sentAt: scheduledAt, createdAt: visitAt });
      return;
    }

    let clickedAt: Date | null = null;
    let remindedAt: Date | null = null;
    if (review) {
      clickedAt = new Date(review.createdAt.getTime() - rng.int(2, 9) * 60_000);
      if (clickedAt < scheduledAt) clickedAt = new Date(scheduledAt.getTime() + 60_000);
      if (clickedAt.getTime() - scheduledAt.getTime() > 3 * DAY) remindedAt = allowedSendTime(new Date(scheduledAt.getTime() + 3 * DAY));
    } else {
      if (rng.chance(0.14)) clickedAt = new Date(scheduledAt.getTime() + rng.float(0.05, 30) * HOUR);
      else if (now.getTime() - scheduledAt.getTime() > 3 * DAY) remindedAt = allowedSendTime(new Date(scheduledAt.getTime() + 3 * DAY));
      if (!clickedAt && remindedAt && rng.chance(0.08)) clickedAt = new Date(remindedAt.getTime() + rng.float(0.05, 10) * HOUR);
    }
    if (clickedAt && clickedAt > now) clickedAt = null;
    if (remindedAt && remindedAt > now) remindedAt = null;
    if (remindedAt) {
      messages.push({
        organizationId: orgId, channel, kind: "REMINDER", to, body: `${person.first}, un petit mot sur votre visite chez ${biz.name} ? https://avis.example/m/${token}`,
        provider: "brevo", providerMessageId: randomUUID(), status: "DELIVERED", reviewRequestId: reqId, sentAt: remindedAt, deliveredAt: new Date(remindedAt.getTime() + 15_000), createdAt: remindedAt,
      });
    }
    if (clickedAt) {
      const base = { organizationId: orgId, locationId, reviewRequestId: reqId, source: "MESSAGE" as const, deviceType: "MOBILE" as const, os: rng.chance(0.55) ? "iOS" : "Android" };
      events.push({ ...base, type: "MESSAGE_CLICK", occurredAt: clickedAt });
      if (review || rng.chance(0.7)) events.push({ ...base, type: "GOOGLE_CLICK", occurredAt: new Date(clickedAt.getTime() + 15_000) });
    }
    requests.push({
      id: reqId, organizationId: orgId, locationId, contactId: id, campaignId: campaign.id, token, channel, visitAt, scheduledAt,
      status: clickedAt ? "CLICKED" : remindedAt ? "REMINDED" : "SENT",
      sentAt: scheduledAt, remindedAt, clickedAt,
      reminderScheduledAt: remindedAt,
      attributedReviewId: review?.id ?? null,
      attribution: review ? (rng.chance(0.85) ? "NAME_MATCH" : "TIME_WINDOW") : null,
      createdAt: visitAt,
    });
  };

  for (const r of converted) {
    const visitAt = new Date(r.createdAt.getTime() - rng.float(4, 48) * HOUR);
    addContact(visitAt, r.author, r);
  }
  for (let t = joinedAt.getTime() + DAY; t < now.getTime(); t += DAY) {
    const day = new Date(t);
    if (!biz.openDays.includes(parisWeekday(day))) continue;
    const n = rng.poisson(def.contactsPerDay * 0.8);
    for (let k = 0; k < n; k++) addContact(parisTime(day, rng.int(biz.hours[0], biz.hours[1] - 1), rng.int(0, 59)));
  }

  await db.contact.createMany({ data: contacts });
  await db.consentEvent.createMany({ data: consents });
  await db.reviewRequest.createMany({ data: requests });
  await db.message.createMany({ data: messages });
  await db.suppression.createMany({ data: suppressions, skipDuplicates: true });
  await db.linkEvent.createMany({ data: events });
  await db.privateFeedback.createMany({ data: feedbacks });
  await db.inboundWebhook.create({
    data: { organizationId: orgId, locationId, name: biz.kind === "restaurant" ? "TheFork / Zenchef" : "Planity", tokenHash: keyedHash(randomToken(), ctx.secret, "webhook") },
  });

  // ── Competitors (Places mock + weekly snapshots) ─────────────────────
  await db.mockPlace.create({
    data: { placeId, name: def.name, category: biz.kind, address: `${def.address}, ${def.postalCode} ${def.city}`, latitude: def.lat, longitude: def.lng, rating: 0, userRatingCount: 0 },
  });
  for (const c of def.competitors) {
    const cPlaceId = `ChIJcomp_${randomCode(12)}`;
    const lat = def.lat + c.dLat;
    const lng = def.lng + c.dLng;
    const weeks = Math.floor(WINDOW_DAYS / 7);
    const startCount = Math.round(c.count - c.growthPerWeek * weeks);
    let rating = c.rating + rng.float(-0.15, 0.1);
    const snaps: Prisma.CompetitorSnapshotCreateManyInput[] = [];
    const competitor = await db.competitor.create({
      data: { organizationId: orgId, locationId, placeId: cPlaceId, name: c.name, category: biz.kind, distanceM: Math.round(Math.hypot(c.dLat * 111_000, c.dLng * 78_000)), createdAt: joinedAt },
    });
    for (let w = 0; w <= weeks; w++) {
      rating = Math.max(3, Math.min(4.9, rating + (c.rating - rating) * 0.05 + rng.float(-0.02, 0.02)));
      const date = new Date(windowStart.getTime() + w * 7 * DAY);
      date.setUTCHours(0, 0, 0, 0);
      snaps.push({ organizationId: orgId, competitorId: competitor.id, date, rating: Math.round(rating * 10) / 10, reviewCount: Math.round(startCount + c.growthPerWeek * w + rng.float(-1, 1)) });
    }
    await db.competitorSnapshot.createMany({ data: snaps, skipDuplicates: true });
    const last = snaps[snaps.length - 1]!;
    await db.mockPlace.create({ data: { placeId: cPlaceId, name: c.name, category: biz.kind, latitude: lat, longitude: lng, rating: last.rating as number, userRatingCount: last.reviewCount as number } });
  }

  // ── Derived data: Google totals, sync state, baseline, daily rollups ─
  const live = reviewRows.filter((r) => !r.removedAt);
  const avg = live.reduce((s, r) => s + (r.rating as number), 0) / live.length;
  await db.location.update({ where: { id: locationId }, data: { googleRating: Math.round(avg * 10) / 10, googleReviewCount: live.length } });
  await db.mockPlace.update({ where: { placeId }, data: { rating: Math.round(avg * 10) / 10, userRatingCount: live.length } });
  await db.reviewSyncState.create({ data: { organizationId: orgId, locationId, lastSyncedAt: now, lastSuccessAt: now, reviewsSeen: live.length } });
  await captureBaseline(orgId, locationId, joinedAt);
  await rollupLocation(locationId, new Date(windowStart.getTime() - DAY), now);
  ctx.log(`    ${live.length} reviews, ${events.length} link events, ${contacts.length} contacts, ${messages.length} messages (index ${index})`);
}
