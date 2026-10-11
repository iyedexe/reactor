import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConsoleMessagingAdapter, type MessagingAdapter } from "@avis/adapters";
import { forTenant, type TenantDb } from "@avis/db";
import { disconnectPrisma, systemDb } from "@avis/db/system";
import { resetDatabase } from "@avis/db/testing";
import { attributeReviews } from "./attribution.ts";
import { deleteContact, importContactsCsv, upsertContact } from "./contacts.ts";
import { dispatchDue, dispatchRequest } from "./dispatch.ts";
import { isSuppressed, optOutByToken } from "./optout.ts";
import { applyDeliveryEvent, createBookingWebhook, handleBookingWebhook, parseBrevoEvent } from "./webhooks.ts";

// Paris wall-clock helpers (October 2026 is CEST, UTC+2, until the 25th).
const paris = (s: string) => new Date(`${s}:00+02:00`);
const TUE_10 = paris("2026-10-13T10:00");

let db: TenantDb;
let locationId: string;
let campaignId: string;
let console_: ConsoleMessagingAdapter;

async function contact(opts: { phone?: string; email?: string; sms?: boolean; mail?: boolean; visitAt?: Date; firstName?: string; lastName?: string } = {}) {
  return upsertContact(
    db,
    {
      locationId,
      firstName: opts.firstName ?? "Karim",
      lastName: opts.lastName ?? "Benali",
      phone: opts.phone ?? "06 12 34 56 78",
      email: opts.email,
      source: "MANUAL",
      consent: { sms: opts.sms ?? true, email: opts.mail },
      consentEvidence: "Accord oral à la caisse",
      consentSource: "manual:test",
      visitAt: opts.visitAt ?? TUE_10,
    },
    opts.visitAt ?? TUE_10,
  );
}

const request = async (contactId: string) => db.reviewRequest.findFirstOrThrow({ where: { contactId } });

beforeEach(async () => {
  await resetDatabase();
  await systemDb().organization.create({ data: { id: "org_c", name: "Le Barbier", slug: "barbier" } });
  db = forTenant({ organizationId: "org_c" });
  locationId = (await db.location.create({ data: { organizationId: "org_c", name: "Le Barbier du Coin", category: "barber_shop" } })).id;
  campaignId = (await db.campaign.create({ data: { organizationId: "org_c", locationId, name: "Après rendez-vous", channels: ["SMS", "EMAIL"], delayAfterVisitHours: 2, reminderAfterDays: 3 } })).id;
  console_ = new ConsoleMessagingAdapter();
});

afterAll(() => disconnectPrisma());

describe("scheduling", () => {
  it("schedules one SMS request after the visit, inside quiet hours", async () => {
    const res = await contact({ visitAt: paris("2026-10-17T19:00") }); // Saturday 19:00 + 2 h → Monday 9:00
    expect(res.schedule).toMatchObject({ status: "scheduled", channel: "SMS" });
    expect((await request(res.contactId)).scheduledAt).toEqual(paris("2026-10-19T09:00"));
  });

  it("never creates a second request for the same customer", async () => {
    const a = await contact();
    const b = await contact({ visitAt: paris("2026-10-14T10:00") });
    expect(b.contactId).toBe(a.contactId);
    expect(b.schedule?.status).toBe("exists");
    expect(await db.reviewRequest.count()).toBe(1);
  });

  it("falls back to e-mail when SMS has no consent, and skips without any consent", async () => {
    const r1 = await contact({ sms: false, email: "k@x.fr", mail: true });
    expect(r1.schedule).toMatchObject({ status: "scheduled", channel: "EMAIL" });
    const r2 = await contact({ phone: "0700000001", sms: false });
    expect(r2.schedule).toEqual({ status: "skipped", reason: "no_consent" });
  });

  it("skips suspended organizations and locations without an active campaign", async () => {
    await db.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
    expect((await contact()).schedule).toEqual({ status: "skipped", reason: "no_campaign" });
    await systemDb().organization.update({ where: { id: "org_c" }, data: { serviceState: "SUSPENDED" } });
    expect((await contact({ phone: "0700000002" })).schedule).toEqual({ status: "skipped", reason: "service_suspended" });
  });
});

describe("sending", () => {
  it("sends once with an opt-out, schedules one reminder, and never sends a third message", async () => {
    const { contactId } = await contact();
    const rr = await request(contactId);
    expect(await dispatchRequest(console_, "org_c", rr.id, "REQUEST", paris("2026-10-13T12:05"))).toBe("sent");
    expect(await dispatchRequest(console_, "org_c", rr.id, "REQUEST", paris("2026-10-13T12:06"))).toBe("noop");
    const sent = await request(contactId);
    expect(sent.status).toBe("SENT");
    expect(sent.reminderScheduledAt).toEqual(paris("2026-10-16T12:05"));
    expect(console_.outbox).toHaveLength(1);
    expect(console_.outbox[0]).toMatchObject({ kind: "sms", to: "+33612345678" });
    expect((console_.outbox[0] as { body: string }).body).toMatch(/\/m\/.+\nSTOP : .+\/u\//);

    expect(await dispatchRequest(console_, "org_c", rr.id, "REMINDER", paris("2026-10-16T12:10"))).toBe("sent");
    expect(await dispatchRequest(console_, "org_c", rr.id, "REMINDER", paris("2026-10-16T12:11"))).toBe("noop");
    expect(await dispatchRequest(console_, "org_c", rr.id, "REQUEST", paris("2026-10-16T12:12"))).toBe("noop");
    expect(console_.outbox).toHaveLength(2);
    const messages = await db.message.findMany({ orderBy: { createdAt: "asc" } });
    expect(messages.map((m) => [m.kind, m.status])).toEqual([
      ["REQUEST", "SENT"],
      ["REMINDER", "SENT"],
    ]);
  });

  it("no reminder once the customer clicked", async () => {
    const { contactId } = await contact();
    const rr = await request(contactId);
    await dispatchRequest(console_, "org_c", rr.id, "REQUEST", paris("2026-10-13T12:05"));
    await db.reviewRequest.update({ where: { id: rr.id }, data: { clickedAt: paris("2026-10-13T13:00"), status: "CLICKED" } });
    expect(await dispatchRequest(console_, "org_c", rr.id, "REMINDER", paris("2026-10-16T12:10"))).toBe("noop");
    expect(console_.outbox).toHaveLength(1);
  });

  it("reschedules instead of sending during quiet hours", async () => {
    const { contactId } = await contact();
    const rr = await request(contactId);
    expect(await dispatchRequest(console_, "org_c", rr.id, "REQUEST", paris("2026-10-13T21:30"))).toBe("rescheduled");
    expect((await request(contactId)).scheduledAt).toEqual(paris("2026-10-14T09:00"));
    expect(console_.outbox).toHaveLength(0);
  });

  it("re-checks consent, opt-outs, campaign and subscription at send time", async () => {
    const c1 = await contact({ phone: "0700000011" });
    const c2 = await contact({ phone: "0700000012" });
    const c3 = await contact({ phone: "0700000013" });
    // consent withdrawn after scheduling
    await upsertContact(db, { locationId, firstName: "Karim", phone: "0700000011", source: "MANUAL", consent: { sms: false }, consentSource: "manual:test" });
    // opted out through the link of another message
    const t2 = (await request(c2.contactId)).token;
    await optOutByToken(t2);
    expect((await request(c2.contactId)).status).toBe("SKIPPED"); // cancelled immediately
    const now = paris("2026-10-13T12:05");
    expect(await dispatchRequest(console_, "org_c", (await request(c1.contactId)).id, "REQUEST", now)).toBe("skipped");
    await db.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
    expect(await dispatchRequest(console_, "org_c", (await request(c3.contactId)).id, "REQUEST", now)).toBe("skipped");
    expect((await request(c3.contactId)).skipReason).toBe("campaign_inactive");
    expect(console_.outbox).toHaveLength(0);
  });

  it("dispatchDue processes everything due across organizations", async () => {
    await contact({ phone: "0700000021" });
    await contact({ phone: "0700000022" });
    await systemDb().organization.create({ data: { id: "org_off", name: "Off", slug: "off", serviceState: "SUSPENDED" } });
    const counts = await dispatchDue(console_, paris("2026-10-13T12:05"));
    expect(counts.sent).toBe(2);
  });

  it("marks the request failed when the provider fails", async () => {
    const failing: MessagingAdapter = { provider: "broken", sendEmail: async () => { throw new Error("boom"); }, sendSms: async () => { throw new Error("boom"); } };
    const { contactId } = await contact();
    expect(await dispatchRequest(failing, "org_c", (await request(contactId)).id, "REQUEST", paris("2026-10-13T12:05"))).toBe("failed");
    expect((await request(contactId)).status).toBe("FAILED");
    expect((await db.message.findFirstOrThrow()).status).toBe("FAILED");
  });
});

describe("opt-out and GDPR", () => {
  it("an erased contact's opt-out is still honored if they come back", async () => {
    const { contactId } = await contact();
    await optOutByToken((await request(contactId)).token);
    await deleteContact(db, contactId);
    expect(await db.contact.count()).toBe(0);
    expect(await isSuppressed(db, "SMS", "+33612345678")).toBe(true);
    const again = await contact(); // same phone, consent ticked again at the counter
    expect(again.schedule).toEqual({ status: "skipped", reason: "opted_out" });
  });

  it("opt-outs are per organization", async () => {
    const { contactId } = await contact();
    await optOutByToken((await request(contactId)).token);
    await systemDb().organization.create({ data: { id: "org_other", name: "Autre", slug: "autre" } });
    expect(await isSuppressed(forTenant({ organizationId: "org_other" }), "SMS", "+33612345678")).toBe(false);
  });
});

describe("CSV import", () => {
  it("imports, applies consent per row or declared, and reports bad lines", async () => {
    const csv = [
      "prenom;nom;telephone;email;consentement_sms;date_visite",
      "Marie;Durand;06 11 22 33 44;;oui;12/10/2026 18h00",
      "Paul;Martin;06 22 33 44 55;;non;12/10/2026 18h00",
      ";Sans prénom;06 33 44 55 66;;oui;",
      "Léa;Roux;;lea@x.fr;;",
      "Tom;;pas-un-numero;;oui;",
    ].join("\n");
    const r = await importContactsCsv(db, { locationId, csv, declaredConsent: { email: true, sms: false }, evidence: "Fichier clients avec opt-in", importedBy: "user1", now: TUE_10 });
    expect(r).toMatchObject({ total: 5, created: 3, scheduled: 1 });
    expect(r.errors.map((e) => e.line)).toEqual([4, 6]);
    const lea = await db.contact.findFirstOrThrow({ where: { email: "lea@x.fr" }, include: { consents: true } });
    expect(lea.consents.map((c) => [c.channel, c.action])).toEqual([["EMAIL", "GRANTED"]]);
  });
});

describe("booking webhook", () => {
  it("authenticates, creates the contact with explicit consent, and schedules", async () => {
    const { id, token } = await createBookingWebhook(db, locationId, "Planity");
    expect(await handleBookingWebhook(id, "wrong", {})).toMatchObject({ ok: false, status: 401 });
    expect(await handleBookingWebhook("nope", token, {})).toMatchObject({ ok: false, status: 404 });
    expect(await handleBookingWebhook(id, token, { phone: "0612345678" })).toMatchObject({ ok: false, status: 422 });
    const ok = await handleBookingWebhook(id, token, { firstName: "Inès", phone: "06 98 76 54 32", consentSms: true, visitAt: TUE_10.toISOString() });
    expect(ok).toMatchObject({ ok: true, created: true, schedule: "scheduled" });
    const again = await handleBookingWebhook(id, token, { firstName: "Inès", phone: "+33698765432", consentSms: true, visitAt: TUE_10.toISOString() });
    expect(again).toMatchObject({ ok: true, created: false, schedule: "exists" });
  });
});

describe("delivery events", () => {
  it("marks delivered, and turns a hard bounce or an SMS STOP into an opt-out", async () => {
    const a = await contact({ phone: "0700000031" });
    const b = await contact({ phone: "0700000032", sms: false, email: "b@x.fr", mail: true });
    await dispatchDue(console_, paris("2026-10-13T12:05"));
    const [ma, mb] = await Promise.all([
      db.message.findFirstOrThrow({ where: { reviewRequest: { contactId: a.contactId } } }),
      db.message.findFirstOrThrow({ where: { reviewRequest: { contactId: b.contactId } } }),
    ]);
    expect(await applyDeliveryEvent(parseBrevoEvent({ event: "delivered", "message-id": ma.providerMessageId }))).toBe("delivered");
    expect((await db.message.findUniqueOrThrow({ where: { id: ma.id } })).status).toBe("DELIVERED");
    await applyDeliveryEvent(parseBrevoEvent({ event: "hard_bounce", "message-id": mb.providerMessageId, email: "b@x.fr" }));
    expect(await isSuppressed(db, "EMAIL", "b@x.fr")).toBe(true);
    await applyDeliveryEvent(parseBrevoEvent({ event: "reply", reply: "STOP", to: "+33700000031" }));
    expect(await isSuppressed(db, "SMS", "07 00 00 00 31")).toBe(true);
  });
});

describe("attribution", () => {
  it("links a review to the request of the customer who wrote it", async () => {
    const { contactId } = await contact({ firstName: "Karim", lastName: "Benali" });
    const rr = await request(contactId);
    await dispatchRequest(console_, "org_c", rr.id, "REQUEST", paris("2026-10-13T12:05"));
    await db.review.create({
      data: { organizationId: "org_c", locationId, googleReviewId: "g1", authorName: "Karim B.", rating: 5, createdAtGoogle: paris("2026-10-14T09:00"), updatedAtGoogle: paris("2026-10-14T09:00") },
    });
    expect(await attributeReviews("org_c", paris("2026-10-01T00:00"))).toEqual({ reviews: 1, matched: 1 });
    expect(await request(contactId)).toMatchObject({ attribution: "NAME_MATCH" });
    expect(await attributeReviews("org_c", paris("2026-10-01T00:00"))).toEqual({ reviews: 1, matched: 0 }); // idempotent
  });
});
