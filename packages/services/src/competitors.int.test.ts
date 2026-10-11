import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MockPlacesAdapter } from "@avis/adapters/places/mock";
import { disconnectPrisma, systemDb } from "@avis/db/system";
import { resetDatabase } from "@avis/db/testing";
import { refreshCompetitors } from "./competitors.ts";

const db = () => systemDb();
let locationId: string;

beforeEach(async () => {
  await resetDatabase();
  await db().organization.create({ data: { id: "org_c", name: "C", slug: "c" } });
  const loc = await db().location.create({
    data: { organizationId: "org_c", name: "Barbier", category: "barber_shop", latitude: 45.76, longitude: 4.83, placeId: "self" },
  });
  locationId = loc.id;
  const places = [
    { placeId: "self", name: "Barbier", lat: 45.76, lng: 4.83 },
    ...Array.from({ length: 7 }, (_, i) => ({ placeId: `p${i}`, name: `Rival ${i}`, lat: 45.76 + (i + 1) * 0.001, lng: 4.83 })),
    { placeId: "far", name: "Far away", lat: 46.5, lng: 4.83 },
  ];
  for (const p of places) {
    await db().mockPlace.create({ data: { placeId: p.placeId, name: p.name, category: "barber_shop", latitude: p.lat, longitude: p.lng, rating: 4.2, userRatingCount: 100 } });
  }
  await db().mockPlace.create({ data: { placeId: "resto", name: "Resto", category: "restaurant", latitude: 45.7601, longitude: 4.83, rating: 4, userRatingCount: 5 } });
});

afterAll(() => disconnectPrisma());

describe("competitor benchmark", () => {
  it("picks the 5 nearest places of the same category, excluding itself", async () => {
    const res = await refreshCompetitors(new MockPlacesAdapter(), "org_c", locationId);
    expect(res).toEqual({ competitors: 5, snapshots: 5 });
    const names = (await db().competitor.findMany({ orderBy: { distanceM: "asc" } })).map((c) => c.name);
    expect(names).toEqual(["Rival 0", "Rival 1", "Rival 2", "Rival 3", "Rival 4"]);
  });

  it("records one snapshot per day (re-running updates it) and keeps the same competitors", async () => {
    const places = new MockPlacesAdapter();
    await refreshCompetitors(places, "org_c", locationId, new Date("2026-10-01T08:00:00Z"));
    await db().mockPlace.update({ where: { placeId: "p0" }, data: { rating: 4.5, userRatingCount: 110 } });
    await refreshCompetitors(places, "org_c", locationId, new Date("2026-10-01T18:00:00Z"));
    await refreshCompetitors(places, "org_c", locationId, new Date("2026-10-08T08:00:00Z"));
    expect(await db().competitor.count()).toBe(5);
    const p0 = await db().competitor.findFirstOrThrow({ where: { placeId: "p0" }, include: { snapshots: { orderBy: { date: "asc" } } } });
    expect(p0.snapshots.map((s) => [s.date.toISOString().slice(0, 10), s.rating])).toEqual([
      ["2026-10-01", 4.5],
      ["2026-10-08", 4.5],
    ]);
  });

  it("untracked competitors are not refreshed", async () => {
    await refreshCompetitors(new MockPlacesAdapter(), "org_c", locationId);
    await db().competitor.updateMany({ where: { placeId: "p0" }, data: { tracked: false } });
    const res = await refreshCompetitors(new MockPlacesAdapter(), "org_c", locationId, new Date(Date.now() + 8 * 86_400_000));
    expect(res.snapshots).toBe(4);
  });
});
