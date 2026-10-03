import type { Rng } from "./rng.ts";

/** French review content for demo data and the mock review generator. */

export type BusinessKind = "restaurant" | "hair_salon" | "car_repair";

interface Bank {
  positive: string[];
  mixed: string[];
  negative: string[];
  english: { positive: string[]; negative: string[] };
}

const BANKS: Record<BusinessKind, Bank> = {
  restaurant: {
    positive: [
      "Cuisine délicieuse et produits frais, on sent le fait maison.",
      "Service rapide et souriant, merci à toute l'équipe !",
      "Super accueil, ambiance chaleureuse, on reviendra sans hésiter.",
      "Le plat du jour était excellent et le rapport qualité-prix imbattable.",
      "Très bonne adresse à Lyon, le tablier de sapeur est une tuerie.",
      "Serveurs aux petits soins, cadre agréable et terrasse au calme.",
      "Desserts maison à tomber, mention spéciale pour la tarte aux pralines.",
      "Une vraie cuisine de bouchon, généreuse et savoureuse.",
      "Accueil adorable, on s'est sentis comme à la maison.",
      "Carte des vins bien choisie et conseils au top.",
      "Repas d'équipe parfait, service efficace malgré le monde.",
      "Excellent déjeuner, rapide et de qualité. Je recommande !",
    ],
    mixed: [
      "Bonne cuisine mais un peu d'attente le samedi soir.",
      "Plats corrects, ambiance sympa, un peu bruyant à l'intérieur.",
      "Bon repas dans l'ensemble, les prix ont un peu augmenté.",
      "Accueil sympathique mais le dessert était un peu décevant.",
    ],
    negative: [
      "Attente beaucoup trop longue, 45 minutes pour un plat du jour.",
      "Viande trop cuite et froide à l'arrivée, déçu.",
      "Service désagréable, on ne s'est pas sentis les bienvenus.",
      "Prix élevés pour des portions vraiment petites.",
      "Table collante et salle pas très propre ce midi.",
      "Réservation non trouvée, on a dû attendre au bar 30 minutes.",
    ],
    english: {
      positive: [
        "Amazing traditional food and very friendly staff. A must in Lyon!",
        "Great value lunch, the waiter was very helpful with the menu.",
        "Lovely atmosphere and delicious food, we will come back.",
      ],
      negative: ["Food was ok but we waited almost an hour, staff seemed overwhelmed."],
    },
  },
  hair_salon: {
    positive: [
      "Margaux est une vraie artiste, ma coupe est parfaite !",
      "Accueil chaleureux, conseils personnalisés et résultat au top.",
      "Très professionnelle, à l'écoute, je ressors ravie de ma couleur.",
      "Salon propre et apaisant, on prend le temps de bien faire.",
      "Balayage magnifique, exactement ce que je voulais.",
      "Toujours ponctuelles et souriantes, je recommande les yeux fermés.",
      "Super expérience, le massage du cuir chevelu est un vrai plaisir.",
      "Coupe homme rapide et soignée, prix raisonnable.",
      "Excellents conseils pour prendre soin de mes cheveux bouclés.",
    ],
    mixed: [
      "Belle coupe mais un peu de retard sur le rendez-vous.",
      "Résultat sympa, tarif un peu élevé pour une couleur.",
      "Bon salon, mais difficile d'avoir un créneau le samedi.",
    ],
    negative: [
      "Couleur ratée, beaucoup trop foncée par rapport à ma demande.",
      "45 minutes de retard sans prévenir, inacceptable.",
      "Coupe trop courte alors que j'avais bien expliqué ce que je voulais.",
      "Tarif annoncé différent de celui payé à la caisse.",
    ],
    english: {
      positive: ["Best haircut I've had in Bordeaux, very professional and friendly."],
      negative: ["Waited 40 minutes past my appointment time, not great."],
    },
  },
  car_repair: {
    positive: [
      "Garage honnête et compétent, devis respecté au centime près.",
      "Diagnostic rapide et explications claires, je recommande.",
      "Révision faite dans la journée, voiture lavée en prime !",
      "Très professionnel, prix raisonnables et délais tenus.",
      "Enfin un garagiste de confiance à Nantes. Merci M. Dumont !",
      "Accueil sympathique, ils ont pris le temps de m'expliquer la panne.",
      "Changement de pneus rapide et tarif correct.",
      "Problème d'embrayage réglé en deux jours, travail soigné.",
    ],
    mixed: [
      "Bon travail mais délai plus long que prévu pour la pièce.",
      "Compétents mais un peu chers sur la main d'œuvre.",
      "Réparation correcte, accueil téléphonique à améliorer.",
    ],
    negative: [
      "Facture bien plus élevée que le devis initial, pas prévenu.",
      "Voiture rendue avec trois jours de retard sans explication.",
      "Le voyant moteur s'est rallumé le lendemain de la réparation.",
      "Personne au téléphone, impossible d'avoir des nouvelles de ma voiture.",
    ],
    english: {
      positive: ["Honest garage, fixed my rental car quickly. Very helpful."],
      negative: ["Expensive and took longer than promised."],
    },
  },
};

/** Planted policy violations, so the flagging workflow has realistic examples. */
export const VIOLATIONS = [
  { category: "SPAM_FAKE", rating: 1, comment: "Allez plutôt chez la concurrence, -20% avec le code PROMO20 sur www.bonplan-exemple.fr" },
  { category: "PERSONAL_INFO", rating: 1, comment: "La serveuse Julie (06 12 34 56 78) est d'une impolitesse rare, appelez-la pour lui dire !" },
  { category: "OFFENSIVE", rating: 1, comment: "Bande d'escrocs, le patron est un voleur et un idiot." },
  { category: "OFF_TOPIC", rating: 2, comment: "Encore une preuve que ce gouvernement détruit les petits commerces, honte aux élections." },
] as const;

export const FEEDBACK_MESSAGES = [
  "Le repas était bon mais la musique était trop forte, dommage.",
  "Petite remarque : les toilettes manquaient de papier ce midi.",
  "Merci pour l'accueil ! Juste un souci de parking aux alentours.",
  "J'ai attendu longtemps pour payer, pensez à ajouter un terminal.",
  "Très bon moment, mais le site internet n'indique pas les bons horaires.",
  "Pourriez-vous proposer une option végétarienne de plus ?",
  "Rendez-vous décalé deux fois, ce serait bien de prévenir par SMS.",
  "Le devis n'était pas très détaillé, j'aurais aimé plus d'explications.",
  "Tout était parfait, je voulais juste vous le dire directement !",
  "Prix un peu élevés mais qualité au rendez-vous.",
];

export const REPLY_POSITIVE = [
  "Merci beaucoup {name} pour ce très beau message ! Toute l'équipe est ravie que vous ayez passé un bon moment chez nous. À très bientôt !",
  "Un grand merci {name} ! Vos mots font plaisir à toute l'équipe. Au plaisir de vous accueillir à nouveau.",
  "Merci {name} pour votre confiance et pour ce retour chaleureux. On vous attend avec plaisir pour une prochaine fois !",
  "Merci {name} ! Ravi que l'expérience vous ait plu, nous transmettons vos compliments à toute l'équipe.",
];

export const REPLY_NEGATIVE = [
  "Bonjour {name}, merci d'avoir pris le temps de nous écrire. Nous sommes sincèrement désolés que votre visite n'ait pas été à la hauteur. Nous avons partagé votre retour avec l'équipe et aimerions en discuter avec vous : n'hésitez pas à nous contacter directement.",
  "Bonjour {name}, nous regrettons vivement cette expérience. Ce n'est pas l'image que nous voulons donner et nous prenons votre remarque très au sérieux. Contactez-nous directement pour que nous puissions comprendre ce qui s'est passé.",
];

export const REPLY_NEGATIVE_EN = "Hello {name}, thank you for your feedback and sorry your experience fell short. We have shared it with the team; please contact us directly so we can understand what happened.";
export const REPLY_POSITIVE_EN = "Thank you so much {name}! We're delighted you enjoyed your visit and hope to welcome you again soon.";

export interface GeneratedText {
  comment: string | null;
  language: "fr" | "en";
}

export function reviewText(rng: Rng, kind: BusinessKind, rating: number, englishShare: number): GeneratedText {
  const bank = BANKS[kind];
  if (rng.chance(0.12)) return { comment: null, language: "fr" }; // rating without text
  if (rng.chance(englishShare)) {
    return { comment: rng.pick(rating >= 4 ? bank.english.positive : bank.english.negative), language: "en" };
  }
  const pool = rating >= 4 ? bank.positive : rating === 3 ? bank.mixed : bank.negative;
  const n = rating >= 4 ? rng.int(1, 2) : 1;
  return { comment: rng.pickN(pool, n).join(" "), language: "fr" };
}

export function replyText(rng: Rng, rating: number, firstName: string, language: "fr" | "en", signature: string): string {
  const tpl =
    language === "en"
      ? rating >= 4
        ? REPLY_POSITIVE_EN
        : REPLY_NEGATIVE_EN
      : rng.pick(rating >= 4 ? REPLY_POSITIVE : REPLY_NEGATIVE);
  return `${tpl.replace("{name}", firstName)}\n${signature}`;
}
