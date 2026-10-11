import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { disconnectPrisma, systemDb } from "@avis/db/system";
import { resetDatabase } from "@avis/db/testing";
import { assignStand, createStands, deactivateOrganizationStands, setStandActive, StandError, standUrls, unassignStand } from "./stands.ts";

const db = () => systemDb();
let loc1: string;
let loc2: string;

beforeEach(async () => {
  await resetDatabase();
  await db().organization.createMany({ data: [{ id: "o1", name: "A", slug: "a" }, { id: "o2", name: "B", slug: "b" }, { id: "o3", name: "C", slug: "c", serviceState: "TERMINATED" }] });
  loc1 = (await db().location.create({ data: { organizationId: "o1", name: "A1", category: "barber_shop" } })).id;
  loc2 = (await db().location.create({ data: { organizationId: "o2", name: "B1", category: "barber_shop" } })).id;
  await db().location.create({ data: { id: "loc3", organizationId: "o3", name: "C1", category: "barber_shop" } });
});

afterAll(() => disconnectPrisma());

describe("stand stock", () => {
  it("creates unique unassigned stands", async () => {
    const codes = await createStands(25, null);
    expect(new Set(codes).size).toBe(25);
    expect(await db().stand.count({ where: { status: "UNASSIGNED", organizationId: null } })).toBe(25);
    await expect(createStands(0, null)).rejects.toThrow(StandError);
  });

  it("assigns to a location (organization taken from the location) and audits", async () => {
    const [code] = await createStands(1, null);
    const stand = await db().stand.findUniqueOrThrow({ where: { code: code! } });
    const s = await assignStand({ standId: stand.id, locationId: loc1, label: "Comptoir", actorUserId: "admin" });
    expect(s).toMatchObject({ organizationId: "o1", locationId: loc1, status: "ACTIVE", label: "Comptoir" });
    expect(await db().auditLog.findFirst({ where: { action: "stand.assign", entityId: stand.id } })).not.toBeNull();
  });

  it("reassigns to another client and records where it came from", async () => {
    const [code] = await createStands(1, null);
    const stand = await db().stand.findUniqueOrThrow({ where: { code: code! } });
    await assignStand({ standId: stand.id, locationId: loc1, actorUserId: null });
    const s = await assignStand({ standId: stand.id, locationId: loc2, actorUserId: null });
    expect(s.organizationId).toBe("o2");
    const log = await db().auditLog.findFirstOrThrow({ where: { action: "stand.reassign" } });
    expect(log.data).toMatchObject({ fromOrganizationId: "o1", toLocationId: loc2 });
  });

  it("refuses terminated clients and activating unassigned stands", async () => {
    const [code] = await createStands(1, null);
    const stand = await db().stand.findUniqueOrThrow({ where: { code: code! } });
    await expect(assignStand({ standId: stand.id, locationId: "loc3", actorUserId: null })).rejects.toThrow(StandError);
    await expect(setStandActive(stand.id, true, null)).rejects.toThrow(StandError);
  });

  it("deactivates, reactivates, returns to stock, and deactivates a whole client", async () => {
    const codes = await createStands(3, null);
    const stands = await db().stand.findMany({ where: { code: { in: codes } } });
    for (const s of stands) await assignStand({ standId: s.id, locationId: loc1, actorUserId: null });
    expect((await setStandActive(stands[0]!.id, false, null)).status).toBe("INACTIVE");
    expect((await setStandActive(stands[0]!.id, true, null)).status).toBe("ACTIVE");
    await unassignStand(stands[1]!.id, null);
    expect(await db().stand.findUniqueOrThrow({ where: { id: stands[1]!.id } })).toMatchObject({ status: "UNASSIGNED", organizationId: null });
    expect(await deactivateOrganizationStands("o1")).toBe(2);
  });

  it("builds NFC and QR urls", () => {
    expect(standUrls("Ab3dEf7h", "https://avb.fr")).toEqual({ nfc: "https://avb.fr/r/Ab3dEf7h?s=n", qr: "https://avb.fr/r/Ab3dEf7h?s=q" });
  });
});
