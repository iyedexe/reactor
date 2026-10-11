import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES } from "./templates.ts";
import { checkTemplate, smsSegments } from "./messages.ts";

describe("template rules", () => {
  it("default templates are valid", () => {
    for (const t of DEFAULT_TEMPLATES) expect(checkTemplate(t.body, t.subject).errors, t.name).toEqual([]);
  });
  it("requires the review link", () => {
    expect(checkTemplate("Bonjour {{prenom}}").errors[0]).toMatch(/lien_avis/);
  });
  it("rejects unknown variables", () => {
    expect(checkTemplate("{{prenom}} {{nom_famille}} {{lien_avis}}").errors).toContain("Variable inconnue : {{nom_famille}}.");
  });
  it.each([
    "Laissez un avis et obtenez -10% sur votre prochaine visite {{lien_avis}}",
    "Un café offert pour tout avis ! {{lien_avis}}",
    "Participez au tirage au sort en laissant un avis {{lien_avis}}",
    "Merci de nous mettre 5 étoiles {{lien_avis}}",
  ])("rejects incentives: %s", (body) => expect(checkTemplate(body).errors.some((e) => e.startsWith("Incitation"))).toBe(true));
  it.each([
    "Si vous êtes satisfait, laissez-nous un avis {{lien_avis}}",
    "Si vous avez aimé, notez-nous {{lien_avis}}",
    "Pas satisfait ? Contactez-nous plutôt. {{lien_avis}}",
  ])("rejects sentiment gating: %s", (body) => expect(checkTemplate(body).errors.some((e) => e.startsWith("Formulation"))).toBe(true));
});

describe("SMS segments", () => {
  it("GSM-7 with French accents that fit the GSM alphabet", () => {
    expect(smsSegments("Merci pour votre visite chez nous, à bientôt ! é è ù")).toMatchObject({ encoding: "UCS-2" }); // ô is not GSM-7
    expect(smsSegments("Merci pour votre visite, a bientot !")).toEqual({ encoding: "GSM-7", length: 36, segments: 1 });
    expect(smsSegments("x".repeat(161)).segments).toBe(2);
  });
  it("counts the euro sign as two GSM characters", () => {
    expect(smsSegments("€").length).toBe(2);
  });
});
