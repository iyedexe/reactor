import { TEMPLATE_VARIABLES } from "./templates.ts";

/**
 * Rules for review-request templates. Every customer gets the same neutral message:
 * no incentive (forbidden by Google and French consumer law) and no sentiment gating.
 */

const INCENTIVES: [RegExp, string][] = [
  [/\b(r[ée]duction|remise|rabais|promo(tion)?|code promo)\b/i, "réduction ou promotion"],
  [/\b(cadeau|offert|offerte|gratuit|gratuite|bon d'achat|ch[eè]que cadeau)\b/i, "cadeau ou avantage offert"],
  [/-\s?\d+\s?%|\d+\s?%\s?(de r[ée]duction|offert)/i, "pourcentage de réduction"],
  [/\b(tirage au sort|concours|jeu-concours|gagner|à gagner)\b/i, "tirage au sort ou concours"],
  [/\b(5|cinq)\s*([ée]toiles|★)/i, "demande d'une note précise"],
];

const GATING: [RegExp, string][] = [
  [/\bsi vous (avez [ée]t[ée] |[êe]tes )?(satisfait|content|ravi)/i, "réservé aux clients satisfaits"],
  [/\bseulement si\b|\buniquement si\b/i, "condition sur l'avis"],
  [/\bsi (vous avez|ça vous a) (aim[ée]|plu)/i, "réservé aux clients satisfaits"],
  [/\b(pas satisfait|m[ée]content).{0,40}(contact|[ée]cri|appel)/i, "détourne les clients mécontents"],
];

export interface TemplateCheck {
  errors: string[];
  warnings: string[];
}

export function checkTemplate(body: string, subject?: string | null): TemplateCheck {
  const text = `${subject ?? ""}\n${body}`;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!/\{\{\s*lien_avis\s*\}\}/.test(body)) errors.push("Le message doit contenir {{lien_avis}}.");
  for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(m[1]!)) errors.push(`Variable inconnue : {{${m[1]}}}.`);
  }
  for (const [re, why] of INCENTIVES) if (re.test(text)) errors.push(`Incitation interdite (${why}) : Google et la loi interdisent de récompenser un avis.`);
  for (const [re, why] of GATING) if (re.test(text)) errors.push(`Formulation interdite (${why}) : tous les clients doivent recevoir la même demande.`);
  if (body.length > 2000) errors.push("Message trop long (2000 caractères maximum).");
  return { errors: [...new Set(errors)], warnings };
}

const GSM7 = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(""),
);
const GSM7_EXT = new Set("^{}\\[~]|€".split(""));

/** SMS length in segments (GSM-7: 160/153 chars, otherwise UCS-2: 70/67). */
export function smsSegments(text: string): { encoding: "GSM-7" | "UCS-2"; length: number; segments: number } {
  let gsm = true;
  let length = 0;
  for (const ch of text) {
    if (GSM7.has(ch)) length += 1;
    else if (GSM7_EXT.has(ch)) length += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) return { encoding: "GSM-7", length, segments: length <= 160 ? 1 : Math.ceil(length / 153) };
  const units = [...text].reduce((n, c) => n + (c.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  return { encoding: "UCS-2", length: units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
}
