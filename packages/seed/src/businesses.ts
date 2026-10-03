import type { BusinessKind } from "./content.ts";

export type StarWeights = readonly (readonly [number, number])[];

export interface LocationDef {
  key: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  lat: number;
  lng: number;
  /** Reviews per week before joining AvisBoost, and after (ramped over the first weeks). */
  preRate: number;
  postRate: number;
  /** Reviews that existed before the 12-month window. */
  olderReviews: number;
  preStars: StarWeights;
  postStars: StarWeights;
  englishShare: number;
  /** Stand taps/scans per open day after joining. */
  scansPerDay: number;
  /** New customers added to review-request campaigns per open day. */
  contactsPerDay: number;
  stands: string[];
  competitors: { name: string; dLat: number; dLng: number; rating: number; count: number; growthPerWeek: number }[];
  /** Planted policy violations (index into VIOLATIONS) with the workflow status they are in. */
  violations: { index: number; status: "TO_SUBMIT" | "SUBMITTED" | "REMOVED" | "REJECTED" }[];
}

export interface BusinessDef {
  slug: string;
  name: string;
  kind: BusinessKind;
  /** Days ago the business joined AvisBoost. */
  joinedDaysAgo: number;
  plan: "ESSENTIEL" | "PRO";
  subscriptionStatus: "ACTIVE" | "TRIALING" | "PAST_DUE";
  owner: { name: string; email: string; phone: string };
  staff: { name: string; email: string };
  brandColor: string;
  signature: string;
  tone: "WARM" | "FORMAL" | "SHORT";
  alwaysMention: string[];
  neverMention: string[];
  openDays: number[]; // 0 = Sunday
  hours: [number, number];
  locations: LocationDef[];
}

const PRE: StarWeights = [[5, 0.46], [4, 0.22], [3, 0.12], [2, 0.08], [1, 0.12]];
const POST: StarWeights = [[5, 0.68], [4, 0.19], [3, 0.06], [2, 0.03], [1, 0.04]];

export const BUSINESSES: BusinessDef[] = [
  {
    slug: "le-petit-zinc",
    name: "Le Petit Zinc",
    kind: "restaurant",
    joinedDaysAgo: 150,
    plan: "PRO",
    subscriptionStatus: "ACTIVE",
    owner: { name: "Sophie Marchand", email: "sophie@lepetitzinc.demo", phone: "+33612345601" },
    staff: { name: "Karim Benali", email: "karim@lepetitzinc.demo" },
    brandColor: "#9f1239",
    signature: "Sophie et l'équipe du Petit Zinc",
    tone: "WARM",
    alwaysMention: ["Pensez à réserver en ligne pour le week-end !"],
    neverMention: ["travaux", "fermeture"],
    openDays: [1, 2, 3, 4, 5, 6],
    hours: [12, 23],
    locations: [
      {
        key: "presquile",
        name: "Le Petit Zinc – Presqu'île",
        address: "18 rue Mercière",
        postalCode: "69002",
        city: "Lyon",
        lat: 45.7622,
        lng: 4.8331,
        preRate: 1.7,
        postRate: 5.2,
        olderReviews: 210,
        preStars: PRE,
        postStars: POST,
        englishShare: 0.08,
        scansPerDay: 7,
        contactsPerDay: 2,
        stands: ["Comptoir", "Terrasse", "Addition"],
        competitors: [
          { name: "Bouchon des Cordeliers", dLat: 0.0021, dLng: 0.0012, rating: 4.4, count: 812, growthPerWeek: 3.1 },
          { name: "Café Mercière", dLat: -0.0008, dLng: 0.0004, rating: 4.1, count: 455, growthPerWeek: 1.8 },
          { name: "La Table de Jacobins", dLat: -0.0019, dLng: -0.0006, rating: 4.3, count: 621, growthPerWeek: 2.2 },
          { name: "Brasserie du Change", dLat: 0.0042, dLng: -0.0015, rating: 3.9, count: 1290, growthPerWeek: 4.0 },
        ],
        violations: [
          { index: 0, status: "REMOVED" },
          { index: 1, status: "SUBMITTED" },
          { index: 2, status: "TO_SUBMIT" },
        ],
      },
      {
        key: "brotteaux",
        name: "Le Petit Zinc – Brotteaux",
        address: "42 boulevard des Brotteaux",
        postalCode: "69006",
        city: "Lyon",
        lat: 45.7679,
        lng: 4.8592,
        preRate: 0.9,
        postRate: 3.4,
        olderReviews: 95,
        preStars: [[5, 0.5], [4, 0.24], [3, 0.1], [2, 0.06], [1, 0.1]],
        postStars: POST,
        englishShare: 0.03,
        scansPerDay: 4,
        contactsPerDay: 1.5,
        stands: ["Comptoir", "Salle"],
        competitors: [
          { name: "Le Comptoir Vitton", dLat: 0.0015, dLng: 0.0011, rating: 4.2, count: 388, growthPerWeek: 1.5 },
          { name: "Bistrot Saxe", dLat: -0.0024, dLng: -0.0018, rating: 4.5, count: 274, growthPerWeek: 1.2 },
          { name: "Les Halles Gourmandes", dLat: 0.0031, dLng: -0.0022, rating: 4.0, count: 960, growthPerWeek: 2.6 },
        ],
        violations: [{ index: 3, status: "REJECTED" }],
      },
    ],
  },
  {
    slug: "atelier-margaux",
    name: "Atelier Margaux Coiffure",
    kind: "hair_salon",
    joinedDaysAgo: 120,
    plan: "ESSENTIEL",
    subscriptionStatus: "ACTIVE",
    owner: { name: "Margaux Lefèvre", email: "margaux@ateliermargaux.demo", phone: "+33612345602" },
    staff: { name: "Inès Garnier", email: "ines@ateliermargaux.demo" },
    brandColor: "#7c3aed",
    signature: "Margaux – Atelier Margaux Coiffure",
    tone: "WARM",
    alwaysMention: [],
    neverMention: ["prix barrés"],
    openDays: [2, 3, 4, 5, 6],
    hours: [9, 19],
    locations: [
      {
        key: "chartrons",
        name: "Atelier Margaux Coiffure",
        address: "7 rue Notre-Dame",
        postalCode: "33000",
        city: "Bordeaux",
        lat: 44.8536,
        lng: -0.5703,
        preRate: 0.8,
        postRate: 3.6,
        olderReviews: 64,
        preStars: [[5, 0.6], [4, 0.2], [3, 0.08], [2, 0.04], [1, 0.08]],
        postStars: [[5, 0.75], [4, 0.16], [3, 0.04], [2, 0.02], [1, 0.03]],
        englishShare: 0.02,
        scansPerDay: 3,
        contactsPerDay: 5,
        stands: ["Accueil", "Miroir 1"],
        competitors: [
          { name: "Studio Coiffure Chartrons", dLat: 0.0012, dLng: 0.0009, rating: 4.6, count: 210, growthPerWeek: 1.1 },
          { name: "Salon Belle Époque", dLat: -0.0021, dLng: 0.0016, rating: 4.3, count: 158, growthPerWeek: 0.6 },
          { name: "Hair Lab Bordeaux", dLat: 0.0035, dLng: -0.0012, rating: 4.7, count: 342, growthPerWeek: 1.6 },
          { name: "Coiff' & Vous", dLat: -0.0038, dLng: -0.0025, rating: 4.0, count: 97, growthPerWeek: 0.3 },
        ],
        violations: [],
      },
    ],
  },
  {
    slug: "garage-dumont",
    name: "Garage Dumont Auto",
    kind: "car_repair",
    joinedDaysAgo: 210,
    plan: "PRO",
    subscriptionStatus: "PAST_DUE",
    owner: { name: "Patrick Dumont", email: "patrick@garagedumont.demo", phone: "+33612345603" },
    staff: { name: "Julien Morel", email: "julien@garagedumont.demo" },
    brandColor: "#0f766e",
    signature: "Patrick Dumont, Garage Dumont Auto",
    tone: "FORMAL",
    alwaysMention: [],
    neverMention: ["assurance"],
    openDays: [1, 2, 3, 4, 5],
    hours: [8, 18],
    locations: [
      {
        key: "nantes",
        name: "Garage Dumont Auto",
        address: "112 route de Vannes",
        postalCode: "44100",
        city: "Nantes",
        lat: 47.2361,
        lng: -1.5937,
        preRate: 0.6,
        postRate: 2.3,
        olderReviews: 88,
        preStars: [[5, 0.42], [4, 0.24], [3, 0.12], [2, 0.08], [1, 0.14]],
        postStars: [[5, 0.62], [4, 0.22], [3, 0.07], [2, 0.04], [1, 0.05]],
        englishShare: 0.01,
        scansPerDay: 2,
        contactsPerDay: 4,
        stands: ["Accueil atelier"],
        competitors: [
          { name: "Speedy Nantes Vannes", dLat: 0.0041, dLng: 0.0032, rating: 3.8, count: 512, growthPerWeek: 1.9 },
          { name: "Garage du Petit Port", dLat: -0.0052, dLng: 0.0044, rating: 4.4, count: 186, growthPerWeek: 0.5 },
          { name: "Auto Services Cens", dLat: 0.0063, dLng: -0.0021, rating: 4.1, count: 143, growthPerWeek: 0.4 },
        ],
        violations: [],
      },
    ],
  },
];

export const DEMO_PASSWORD = "demo-avisboost";
export const ADMIN_DEFAULT_EMAIL = "admin@avisboost.local";
export const ADMIN_DEFAULT_PASSWORD = "admin-avisboost";
