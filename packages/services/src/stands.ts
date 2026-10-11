import { audit, systemDb } from "@avis/db/system";
import { linksBaseUrl } from "@avis/core/env";
import { randomCode } from "@avis/core/crypto";

/**
 * Stand stock management (platform admin only: stands belong to AvisBoost until assigned).
 * Every change is audited and picked up by the links service instantly (Postgres NOTIFY trigger).
 */

export class StandError extends Error {}

export async function createStands(count: number, actorUserId: string | null): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new StandError("Entre 1 et 500 supports à la fois.");
  const db = systemDb();
  const codes: string[] = [];
  while (codes.length < count) {
    const code = randomCode(8);
    const exists = await db.stand.findUnique({ where: { code }, select: { id: true } });
    if (!exists && !codes.includes(code)) codes.push(code);
  }
  await db.stand.createMany({ data: codes.map((code) => ({ code, status: "UNASSIGNED" as const })) });
  await audit({ actorUserId, action: "stand.create_batch", data: { count } });
  return codes;
}

export async function assignStand(input: { standId: string; locationId: string; label?: string | null; actorUserId: string | null }) {
  const db = systemDb();
  const [stand, location] = await Promise.all([
    db.stand.findUnique({ where: { id: input.standId } }),
    db.location.findUnique({ where: { id: input.locationId }, include: { organization: { select: { serviceState: true } } } }),
  ]);
  if (!stand) throw new StandError("Support introuvable.");
  if (!location) throw new StandError("Établissement introuvable.");
  if (location.organization.serviceState === "TERMINATED") throw new StandError("Ce client est résilié.");
  const updated = await db.stand.update({
    where: { id: stand.id },
    data: {
      organizationId: location.organizationId,
      locationId: location.id,
      label: input.label?.trim() || stand.label,
      status: "ACTIVE",
      assignedAt: new Date(),
      deactivatedAt: null,
    },
  });
  await audit({
    organizationId: location.organizationId,
    actorUserId: input.actorUserId,
    action: stand.organizationId ? "stand.reassign" : "stand.assign",
    entity: "Stand",
    entityId: stand.id,
    data: { code: stand.code, fromOrganizationId: stand.organizationId, fromLocationId: stand.locationId, toLocationId: location.id },
  });
  return updated;
}

export async function setStandActive(standId: string, active: boolean, actorUserId: string | null) {
  const db = systemDb();
  const stand = await db.stand.findUnique({ where: { id: standId } });
  if (!stand) throw new StandError("Support introuvable.");
  if (active && !stand.locationId) throw new StandError("Assignez d'abord le support à un établissement.");
  const updated = await db.stand.update({
    where: { id: standId },
    data: active ? { status: "ACTIVE", deactivatedAt: null } : { status: "INACTIVE", deactivatedAt: new Date() },
  });
  await audit({ organizationId: stand.organizationId, actorUserId, action: active ? "stand.activate" : "stand.deactivate", entity: "Stand", entityId: standId, data: { code: stand.code } });
  return updated;
}

/** Back to stock (e.g. recovered from a client who left). */
export async function unassignStand(standId: string, actorUserId: string | null) {
  const db = systemDb();
  const stand = await db.stand.findUnique({ where: { id: standId } });
  if (!stand) throw new StandError("Support introuvable.");
  await db.stand.update({ where: { id: standId }, data: { organizationId: null, locationId: null, label: null, status: "UNASSIGNED", assignedAt: null, deactivatedAt: new Date() } });
  await audit({ organizationId: stand.organizationId, actorUserId, action: "stand.unassign", entity: "Stand", entityId: standId, data: { code: stand.code } });
}

/** Used when a client's grace period ends (phase 7). */
export async function deactivateOrganizationStands(organizationId: string, actorUserId: string | null = null): Promise<number> {
  const res = await systemDb().stand.updateMany({ where: { organizationId, status: "ACTIVE" }, data: { status: "INACTIVE", deactivatedAt: new Date() } });
  if (res.count) await audit({ organizationId, actorUserId, action: "stand.deactivate_all", data: { count: res.count } });
  return res.count;
}

/** The URLs written on NFC tags and encoded in QR codes (the `s` parameter tells them apart in stats). */
export function standUrls(code: string, base = linksBaseUrl()) {
  return { nfc: `${base}/r/${code}?s=n`, qr: `${base}/r/${code}?s=q` };
}
