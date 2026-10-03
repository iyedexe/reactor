/**
 * Default review-request templates (French). Variables: {{prenom}}, {{entreprise}}, {{lien_avis}}.
 * The opt-out line is appended automatically at send time and cannot be removed.
 * Wording is deliberately neutral: every customer gets the same message, with no incentive.
 */
export const TEMPLATE_VARIABLES = ["prenom", "entreprise", "lien_avis"] as const;

export const DEFAULT_TEMPLATES = [
  {
    channel: "EMAIL",
    kind: "REQUEST",
    name: "E-mail – demande d'avis",
    subject: "{{prenom}}, comment s'est passée votre visite chez {{entreprise}} ?",
    body:
      "Bonjour {{prenom}},\n\nMerci pour votre visite chez {{entreprise}} ! Votre avis compte beaucoup pour nous et aide d'autres clients à nous découvrir.\n\nAuriez-vous une minute pour partager votre expérience ?\n{{lien_avis}}\n\nMerci et à bientôt,\nL'équipe {{entreprise}}",
  },
  {
    channel: "EMAIL",
    kind: "REMINDER",
    name: "E-mail – relance",
    subject: "Un petit mot sur votre visite chez {{entreprise}} ?",
    body:
      "Bonjour {{prenom}},\n\nNous serions ravis d'avoir votre retour sur votre récente visite chez {{entreprise}}. Cela ne prend qu'une minute :\n{{lien_avis}}\n\nMerci beaucoup,\nL'équipe {{entreprise}}",
  },
  {
    channel: "SMS",
    kind: "REQUEST",
    name: "SMS – demande d'avis",
    subject: null,
    body: "Bonjour {{prenom}}, merci pour votre visite chez {{entreprise}} ! Votre avis nous aiderait beaucoup : {{lien_avis}}",
  },
  {
    channel: "SMS",
    kind: "REMINDER",
    name: "SMS – relance",
    subject: null,
    body: "{{prenom}}, un petit mot sur votre visite chez {{entreprise}} ? {{lien_avis}}",
  },
] as const;

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => vars[k] ?? m);
}
