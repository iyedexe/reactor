/** Topics we tag reviews with. Keys are stable; labels live in i18n messages. */
export const TOPICS = ["service", "quality", "price", "waiting_time", "cleanliness", "welcome", "ambiance", "expertise"] as const;
export type Topic = (typeof TOPICS)[number];

/** Keyword hints used by the mock classifier and as a fallback (French + English). */
export const TOPIC_KEYWORDS: Record<Topic, RegExp> = {
  service: /\bservice|serveu[rs]e?|personnel|équipe|staff|waiter/i,
  quality: /\bqualit|délicieu|excellent|savoureu|frais|fraîch|travail soigné|résultat|quality|tasty|delicious/i,
  price: /\bprix|tarif|cher|abordable|rapport qualité|addition|devis|price|expensive|cheap/i,
  waiting_time: /\battente|attendu|attendre|rapide|lent|retard|délai|wait|slow|quick/i,
  cleanliness: /\bpropre|propreté|sale|hygiène|clean|dirty/i,
  welcome: /\baccueil|accueillant|souriant|chaleureu|aimable|gentil|friendly|welcom/i,
  ambiance: /\bambiance|cadre|déco|bruyant|calme|terrasse|atmosph/i,
  expertise: /\bconseil|professionnel|compétent|expert|diagnostic|explications|professional/i,
};

export function detectTopics(text: string | null | undefined): Topic[] {
  if (!text) return [];
  return TOPICS.filter((t) => TOPIC_KEYWORDS[t].test(text));
}
