"use server";

import { enqueue, JOBS } from "@avis/services";
import { requireTenant } from "../session";

/** "Synchroniser maintenant": queues a review sync for the tenant's connected locations. */
export async function syncNowAction(): Promise<{ queued: number }> {
  const { db } = await requireTenant();
  const locations = await db.location.findMany({ where: { status: "ACTIVE", gbpLocationId: { not: null } }, select: { id: true } });
  for (const l of locations) {
    await enqueue(JOBS.syncLocation, { organizationId: db.organizationId, locationId: l.id }, { singletonKey: l.id });
  }
  return { queued: locations.length };
}
