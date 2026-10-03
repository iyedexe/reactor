import { detectTopics } from "@avis/core/topics";
import type { ClassificationInput, ClassificationOutput, LlmAdapter, ReplyInput, ReplyOutput } from "./types.ts";

/** Deterministic stand-in for Claude, so the app works end to end without an API key. */
export class MockLlmAdapter implements LlmAdapter {
  readonly mode = "mock" as const;

  async generateReply({ review, business, settings }: ReplyInput): Promise<ReplyOutput> {
    const language = guessLanguage(review.comment);
    const first = review.authorDisplayName.split(/\s+/)[0] ?? "";
    const sign = settings.signature ? `\n${settings.signature}` : `\nL'équipe ${business.name}`;
    let body: string;
    if (language === "en") {
      body = review.rating >= 4
        ? `Thank you ${first} for your kind review! We're delighted you enjoyed your visit and hope to see you again soon.`
        : `Thank you ${first} for your feedback. We're sorry your experience didn't meet expectations; please contact us so we can understand what happened.`;
    } else if (review.rating >= 4) {
      body = settings.tone === "SHORT"
        ? `Merci ${first} pour votre avis, à très bientôt !`
        : settings.tone === "FORMAL"
          ? `Bonjour ${first}, nous vous remercions sincèrement pour votre avis. Toute l'équipe sera ravie de vous accueillir à nouveau.`
          : `Merci beaucoup ${first} pour ce joli message ! Toute l'équipe est ravie que vous ayez passé un bon moment chez ${business.name}. À très vite !`;
    } else {
      body = `Bonjour ${first}, merci d'avoir pris le temps de nous faire ce retour. Nous sommes désolés que votre expérience n'ait pas été à la hauteur. Nous aimerions en discuter avec vous : n'hésitez pas à nous contacter directement.`;
    }
    if (settings.alwaysMention.length && language !== "en") body += ` ${settings.alwaysMention[0]}`;
    return { body: body + sign, language, model: "mock", promptVersion: "mock-1" };
  }

  async classifyReview({ review }: ClassificationInput): Promise<ClassificationOutput> {
    const text = review.comment ?? "";
    const sentiment = (review.rating - 3) / 2;
    const base = { sentiment, topics: detectTopics(text), language: guessLanguage(text), model: "mock", promptVersion: "mock-1" };
    if (/https?:\/\/|www\.|promo|code réduction|bitcoin/i.test(text)) {
      return { ...base, category: "SPAM_FAKE", confidence: 0.86, explanation: "L'avis contient un lien ou du contenu promotionnel sans rapport avec une expérience client." };
    }
    if (/\b0[67](\s?\d{2}){4}\b|@\w+\.\w+/.test(text)) {
      return { ...base, category: "PERSONAL_INFO", confidence: 0.82, explanation: "L'avis contient des coordonnées personnelles (téléphone ou e-mail)." };
    }
    if (/connard|idiot|nul à chier|escroc|voleur/i.test(text)) {
      return { ...base, category: "OFFENSIVE", confidence: 0.78, explanation: "L'avis contient des insultes ou des accusations injurieuses." };
    }
    if (/politique|élections|gouvernement|vaccin/i.test(text)) {
      return { ...base, category: "OFF_TOPIC", confidence: 0.74, explanation: "L'avis traite d'un sujet sans lien avec l'établissement." };
    }
    if (review.rating <= 2 && text.trim().length === 0) {
      return { ...base, category: "NONE", confidence: 0.6, explanation: "Note négative sans commentaire : rien n'indique une violation des règles de Google." };
    }
    return { ...base, category: "NONE", confidence: 0.9, explanation: "Avis authentique sur une expérience client, conforme aux règles de Google." };
  }
}

export function guessLanguage(text: string | null | undefined): string {
  if (!text) return "fr";
  const en = (text.match(/\b(the|and|was|very|great|we|food|staff|good)\b/gi) ?? []).length;
  const fr = (text.match(/\b(le|la|les|et|très|est|nous|un|une|pour|avec)\b/gi) ?? []).length;
  return en > fr ? "en" : "fr";
}
