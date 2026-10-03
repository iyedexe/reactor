import { systemDb } from "@avis/db/system";
import { distanceM, type PlaceSummary, type PlacesAdapter } from "./types.ts";

/** Mock Places API backed by the mock_place table. */
export class MockPlacesAdapter implements PlacesAdapter {
  readonly mode = "mock" as const;

  async getPlace(placeId: string): Promise<PlaceSummary | null> {
    const p = await systemDb().mockPlace.findUnique({ where: { placeId } });
    return p ? toSummary(p) : null;
  }

  async searchNearby(q: { latitude: number; longitude: number; category: string; radiusM?: number; max?: number }): Promise<PlaceSummary[]> {
    const radius = q.radiusM ?? 3000;
    const rows = await systemDb().mockPlace.findMany({ where: { category: q.category } });
    return rows
      .map(toSummary)
      .map((p) => ({ p, d: distanceM(q, p) }))
      .filter((x) => x.d <= radius && x.d > 0)
      .sort((a, b) => a.d - b.d)
      .slice(0, q.max ?? 5)
      .map((x) => x.p);
  }
}

function toSummary(p: { placeId: string; name: string; category: string; address: string | null; latitude: number; longitude: number; rating: number; userRatingCount: number }): PlaceSummary {
  return { ...p, address: p.address ?? undefined };
}
