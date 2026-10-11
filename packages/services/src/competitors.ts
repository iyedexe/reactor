import { distanceM, type PlacesAdapter } from "@avis/adapters";
import { forTenant } from "@avis/db";
import { dateFromKey, dateKeyInTz } from "@avis/core/dates";

export const MAX_COMPETITORS = 5;

/**
 * Weekly competitor benchmark for one location: picks the nearest places of the same category the first
 * time (up to 5), then records today's rating and review count for each tracked competitor.
 */
export async function refreshCompetitors(places: PlacesAdapter, organizationId: string, locationId: string, now = new Date()) {
  const db = forTenant({ organizationId });
  const loc = await db.location.findUniqueOrThrow({ where: { id: locationId } });
  let competitors = await db.competitor.findMany({ where: { locationId } });

  if (competitors.length === 0 && loc.latitude != null && loc.longitude != null) {
    const nearby = await places.searchNearby({ latitude: loc.latitude, longitude: loc.longitude, category: loc.category, max: MAX_COMPETITORS + 1 });
    for (const p of nearby.filter((p) => p.placeId !== loc.placeId).slice(0, MAX_COMPETITORS)) {
      await db.competitor.create({
        data: {
          organizationId,
          locationId,
          placeId: p.placeId,
          name: p.name,
          category: p.category,
          distanceM: distanceM({ latitude: loc.latitude, longitude: loc.longitude }, p),
        },
      });
    }
    competitors = await db.competitor.findMany({ where: { locationId } });
  }

  const date = dateFromKey(dateKeyInTz(now, loc.timezone));
  let snapshots = 0;
  for (const c of competitors.filter((c) => c.tracked)) {
    const p = await places.getPlace(c.placeId);
    if (!p) continue;
    await db.competitorSnapshot.upsert({
      where: { competitorId_date: { competitorId: c.id, date } },
      create: { organizationId, competitorId: c.id, date, rating: p.rating, reviewCount: p.userRatingCount },
      update: { rating: p.rating, reviewCount: p.userRatingCount },
    });
    snapshots++;
  }
  return { competitors: competitors.length, snapshots };
}
