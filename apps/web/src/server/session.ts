import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { forTenant, type TenantDb, type TenantRole } from "@avis/db";
import { systemDb } from "@avis/db/system";
import { auth } from "./auth";

export const ORG_COOKIE = "avis_org";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/connexion");
  return session;
}

export function isPlatformAdmin(user: { role?: string | null }): boolean {
  return user.role === "admin";
}

export async function requirePlatformAdmin() {
  const session = await requireUser();
  if (!isPlatformAdmin(session.user) || session.session.impersonatedBy) redirect("/tableau-de-bord");
  return session;
}

export interface TenantRequest {
  db: TenantDb;
  user: { id: string; name: string; email: string };
  role: TenantRole;
  organization: { id: string; name: string; slug: string; serviceState: string };
  memberships: { organizationId: string; name: string }[];
  impersonatorId: string | null;
}

/**
 * Resolves the organization for the current request and returns a tenant-scoped DB client.
 * The organization always comes from the user's memberships; the cookie only selects among them.
 */
export const requireTenant = cache(async (): Promise<TenantRequest> => {
  const session = await requireUser();
  const memberships = await systemDb().member.findMany({
    where: { userId: session.user.id },
    include: { organization: { select: { id: true, name: true, slug: true, serviceState: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) {
    if (isPlatformAdmin(session.user)) redirect("/admin");
    redirect("/connexion?erreur=sans-organisation");
  }
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const m = memberships.find((x) => x.organizationId === wanted) ?? memberships[0]!;
  const role = (m.role === "owner" ? "owner" : "staff") as TenantRole;
  const impersonatorId = session.session.impersonatedBy ?? null;
  return {
    db: forTenant({ organizationId: m.organizationId, userId: session.user.id, role, impersonatorId }),
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    role,
    organization: m.organization,
    memberships: memberships.map((x) => ({ organizationId: x.organizationId, name: x.organization.name })),
    impersonatorId,
  };
});

export async function requireOwner(): Promise<TenantRequest> {
  const t = await requireTenant();
  if (t.role !== "owner") redirect("/tableau-de-bord?erreur=reserve-au-gerant");
  return t;
}
