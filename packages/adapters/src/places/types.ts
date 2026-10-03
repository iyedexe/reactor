export interface PlaceSummary {
  placeId: string;
  name: string;
  category: string;
  address?: string;
  latitude: number;
  longitude: number;
  rating: number;
  userRatingCount: number;
}

export interface PlacesAdapter {
  readonly mode: "mock" | "live";
  getPlace(placeId: string): Promise<PlaceSummary | null>;
  /** Nearest places of the same category, closest first. */
  searchNearby(q: { latitude: number; longitude: number; category: string; radiusM?: number; max?: number }): Promise<PlaceSummary[]>;
}

/** Great-circle distance in meters. */
export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
