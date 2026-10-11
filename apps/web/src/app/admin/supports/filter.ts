import type { Prisma } from "@avis/db";

export function standFilter(sp: Record<string, string | string[] | undefined>): Prisma.StandWhereInput {
  const statut = typeof sp.statut === "string" ? sp.statut : "";
  const client = typeof sp.client === "string" ? sp.client : "";
  const where: Prisma.StandWhereInput = {};
  if (statut === "stock") where.status = "UNASSIGNED";
  else if (statut === "actifs") where.status = "ACTIVE";
  else if (statut === "inactifs") where.status = "INACTIVE";
  if (client) where.organizationId = client;
  return where;
}
