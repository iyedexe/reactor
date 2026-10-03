import { prisma, type RawPrisma } from "./client.ts";

/**
 * Unscoped database access for code that legitimately works across tenants:
 * the worker (schedules fan out over all organizations), the links service, auth, the platform admin
 * panel and the seed script. ESLint only allows importing "@avis/db/system" from those places.
 *
 * Mutations made on behalf of a person should be recorded with `audit()`.
 */
export function systemDb(): RawPrisma {
  return prisma();
}

export interface AuditEntry {
  organizationId?: string | null;
  actorUserId?: string | null;
  impersonatorId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  data?: Record<string, unknown>;
}

export async function audit(entry: AuditEntry, db: Pick<RawPrisma, "auditLog"> = prisma()): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: entry.organizationId ?? null,
      actorUserId: entry.actorUserId ?? null,
      impersonatorId: entry.impersonatorId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      data: (entry.data ?? undefined) as never,
    },
  });
}

export { createPrisma, disconnectPrisma, type RawPrisma } from "./client.ts";
