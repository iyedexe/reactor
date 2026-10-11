import { describe, expect, it } from "vitest";
import { matchReview, nameMatches } from "./attribution.ts";
import { parseCsv, parseVisitDate } from "./contacts.ts";
import { effectiveConsent } from "./optout.ts";
import { renderEmail, renderSms } from "./render.ts";
import { parseBrevoEvent } from "./webhooks.ts";

describe("consent", () => {
  const at = (s: string) => new Date(s);
  it("latest event per channel wins; no event means no consent", () => {
    const events = [
      { channel: "SMS" as const, action: "GRANTED" as const, createdAt: at("2026-01-01") },
      { channel: "SMS" as const, action: "WITHDRAWN" as const, createdAt: at("2026-02-01") },
      { channel: "EMAIL" as const, action: "GRANTED" as const, createdAt: at("2026-01-01") },
    ];
    expect(effectiveConsent(events, "SMS")).toBe(false);
    expect(effectiveConsent(events, "EMAIL")).toBe(true);
    expect(effectiveConsent([], "EMAIL")).toBe(false);
  });
});

describe("name matching", () => {
  it.each([
    ["Marie D.", "Marie", "Dupont", true],
    ["marie dupont", "Marie", "Dupont", true],
    ["Hélène Lefèvre", "Helene", "Lefevre", true],
    ["Marie", "Marie", "Dupont", true],
    ["Marie M.", "Marie", "Dupont", false],
    ["Marine D.", "Marie", "Dupont", false],
  ])("%s vs %s %s → %s", (display, first, last, expected) => {
    expect(nameMatches(display, first, last)).toBe(expected);
  });

  const t = (h: number) => new Date(Date.UTC(2026, 9, 10, h));
  it("prefers a name match, else a click within 24 h, else nothing", () => {
    const c = [
      { id: "a", firstName: "Paul", lastName: "Martin", sentAt: t(0), clickedAt: null },
      { id: "b", firstName: "Léa", lastName: "Roux", sentAt: t(1), clickedAt: t(20) },
    ];
    expect(matchReview({ authorName: "Paul M.", createdAt: t(22) }, c)).toEqual({ requestId: "a", method: "NAME_MATCH" });
    expect(matchReview({ authorName: "Inconnu X.", createdAt: t(22) }, c)).toEqual({ requestId: "b", method: "TIME_WINDOW" });
    expect(matchReview({ authorName: "Inconnu X.", createdAt: t(60) }, c)).toBeNull(); // click older than 24 h
    expect(matchReview({ authorName: "Paul M.", createdAt: new Date(t(0).getTime() - 3_600_000) }, c)).toBeNull(); // before sending
  });
});

describe("CSV", () => {
  it("parses ; or , with quotes and BOM", () => {
    expect(parseCsv('\uFEFFprenom;nom;email\r\n"Marie";"Du;pont";m@x.fr\r\n\r\nPaul;"Le ""Grand""";p@x.fr')).toEqual([
      ["prenom", "nom", "email"],
      ["Marie", "Du;pont", "m@x.fr"],
      ["Paul", 'Le "Grand"', "p@x.fr"],
    ]);
    expect(parseCsv("first_name,email\nAnna,a@x.fr")).toEqual([["first_name", "email"], ["Anna", "a@x.fr"]]);
  });
  it("reads French dates in Paris time", () => {
    expect(parseVisitDate("12/10/2026 14h30")?.toISOString()).toBe("2026-10-12T12:30:00.000Z");
    expect(parseVisitDate("2026-01-15")?.toISOString()).toBe("2026-01-15T11:00:00.000Z");
    expect(parseVisitDate("demain")).toBeNull();
  });
});

describe("rendering", () => {
  const ctx = { firstName: "Karim", businessName: "Le Barbier", reviewLink: "https://avb.fr/m/tok", unsubscribeLink: "https://avb.fr/u/tok", oneClickUnsubscribeUrl: "https://app.fr/api/unsubscribe/tok" };
  it("SMS always ends with an opt-out", () => {
    const sms = renderSms("Bonjour {{prenom}}, votre avis chez {{entreprise}} : {{lien_avis}}", ctx, "+33612345678");
    expect(sms.body).toBe("Bonjour Karim, votre avis chez Le Barbier : https://avb.fr/m/tok\nSTOP : https://avb.fr/u/tok");
  });
  it("e-mail has an unsubscribe link and one-click headers, and escapes HTML", () => {
    const m = renderEmail("Merci {{prenom}}", "Bonjour {{prenom}} <b>\n\n{{lien_avis}}", { ...ctx, firstName: "<Karim>" }, "k@x.fr");
    expect(m.subject).toBe("Merci <Karim>");
    expect(m.text).toContain("https://avb.fr/u/tok");
    expect(m.html).toContain("&lt;Karim&gt;");
    expect(m.html).not.toContain("<b>");
    expect(m.html).toContain('href="https://avb.fr/m/tok"');
    expect(m.headers).toEqual({ "List-Unsubscribe": "<https://app.fr/api/unsubscribe/tok>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });
});

describe("Brevo events", () => {
  it.each([
    [{ event: "delivered", "message-id": "<1@x>" }, { kind: "delivered", messageId: "<1@x>" }],
    [{ event: "hard_bounce", "message-id": "<1@x>", email: "a@x.fr" }, { kind: "bounce", messageId: "<1@x>", email: "a@x.fr" }],
    [{ event: "hardBounce", messageId: "<1@x>" }, { kind: "bounce", messageId: "<1@x>", email: undefined }],
    [{ event: "soft_bounce", "message-id": "<1@x>" }, { kind: "failed", messageId: "<1@x>" }],
    [{ event: "spam", "message-id": "<1@x>" }, { kind: "complaint", messageId: "<1@x>", email: undefined }],
    [{ event: "unsubscribed", "message-id": "<1@x>" }, { kind: "unsubscribe", messageId: "<1@x>", email: undefined }],
    [{ event: "reply", reply: "STOP", to: "+33612345678" }, { kind: "sms_stop", phone: "+33612345678" }],
    [{ event: "reply", reply: "merci", to: "+33612345678" }, { kind: "ignored" }],
    [{ event: "opened" }, { kind: "ignored" }],
  ])("%j", (body, expected) => expect(parseBrevoEvent(body)).toEqual(expected));
});
