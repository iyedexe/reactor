import { distanceM, type PlaceSummary, type PlacesAdapter } from "./types.ts";

const FIELDS = "id,displayName,primaryType,formattedAddress,location,rating,userRatingCount";

interface ApiPlace {
  id: string;
  displayName?: { text: string };
  primaryType?: string;
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
}

/** Google Places API (New). Needs GOOGLE_PLACES_API_KEY with the Places API (New) enabled. */
export class LivePlacesAdapter implements PlacesAdapter {
  readonly mode = "live" as const;
  constructor(private readonly apiKey: string | undefined) {}

  private headers(mask: string) {
    if (!this.apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");
    return { "content-type": "application/json", "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": mask };
  }

  async getPlace(placeId: string): Promise<PlaceSummary | null> {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: this.headers(FIELDS) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Places getPlace failed: ${res.status} ${await res.text()}`);
    return toSummary((await res.json()) as ApiPlace);
  }

  async searchNearby(q: { latitude: number; longitude: number; category: string; radiusM?: number; max?: number }): Promise<PlaceSummary[]> {
    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: this.headers(FIELDS.split(",").map((f) => `places.${f}`).join(",")),
      body: JSON.stringify({
        includedTypes: [q.category],
        maxResultCount: Math.min((q.max ?? 5) + 1, 20),
        rankPreference: "DISTANCE",
        languageCode: "fr",
        locationRestriction: { circle: { center: { latitude: q.latitude, longitude: q.longitude }, radius: q.radiusM ?? 3000 } },
      }),
    });
    if (!res.ok) throw new Error(`Places searchNearby failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { places?: ApiPlace[] };
    return (json.places ?? [])
      .map(toSummary)
      .filter((p) => distanceM(q, p) > 0) // excludes the business itself
      .slice(0, q.max ?? 5);
  }
}

function toSummary(p: ApiPlace): PlaceSummary {
  return {
    placeId: p.id,
    name: p.displayName?.text ?? p.id,
    category: p.primaryType ?? "unknown",
    address: p.formattedAddress,
    latitude: p.location?.latitude ?? 0,
    longitude: p.location?.longitude ?? 0,
    rating: p.rating ?? 0,
    userRatingCount: p.userRatingCount ?? 0,
  };
}
