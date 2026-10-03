import { randomUUID } from "node:crypto";
import { systemDb } from "@avis/db/system";
import { reviewText, type BusinessKind } from "@avis/seed/content";
import { Rng } from "@avis/seed/rng";

const FIRST = ["Camille", "Lucas", "Emma", "Hugo", "Léa", "Louis", "Chloé", "Nathan", "Manon", "Jules", "Inès", "Thomas", "Sarah", "Paul"];
const LAST = ["Martin", "Bernard", "Dubois", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Michel", "Garcia", "Roux", "Fournier"];

/**
 * Mock mode only: adds an occasional new review to the mock Google data, so the scheduled sync,
 * reply pipeline and alerts can be watched working in a demo without Google API access.
 */
export async function generateMockReviews(now = new Date()): Promise<number> {
  const rng = new Rng(now.getTime() % 2 ** 31);
  const db = systemDb();
  const locations = await db.location.findMany({
    where: { status: "ACTIVE", gbpLocationId: { not: null }, organization: { serviceState: "ACTIVE" } },
    select: { gbpLocationId: true, category: true },
  });
  let created = 0;
  for (const loc of locations) {
    if (!rng.chance(0.25)) continue;
    const rating = rng.weighted([[5, 66], [4, 20], [3, 7], [2, 3], [1, 4]] as const);
    const kind = (["restaurant", "hair_salon", "car_repair"].includes(loc.category) ? loc.category : "restaurant") as BusinessKind;
    const text = reviewText(rng, kind, rating, 0.05);
    await db.mockGbpReview.create({
      data: {
        gbpLocationId: loc.gbpLocationId!,
        reviewId: `AbFvO${randomUUID().replace(/-/g, "").slice(0, 18)}`,
        reviewerName: `${rng.pick(FIRST)} ${rng.pick(LAST).charAt(0)}.`,
        starRating: rating,
        comment: text.comment,
        createTime: now,
        updateTime: now,
      },
    });
    created++;
  }
  return created;
}
