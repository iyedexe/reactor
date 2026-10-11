"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assignStand, createStands, setStandActive, StandError, unassignStand } from "@avis/services";
import { requirePlatformAdmin, requireTenant } from "../session";

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>, message?: string): Promise<Result> {
  try {
    await fn();
    revalidatePath("/admin/supports");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof StandError || e instanceof z.ZodError) return { ok: false, error: e instanceof z.ZodError ? "Données invalides." : e.message };
    throw e;
  }
}

export async function createStandsAction(count: number): Promise<Result> {
  const { user } = await requirePlatformAdmin();
  return run(() => createStands(z.number().int().min(1).max(500).parse(count), user.id), `${count} supports créés.`);
}

export async function assignStandAction(input: { standId: string; locationId: string; label?: string }): Promise<Result> {
  const { user } = await requirePlatformAdmin();
  const p = z.object({ standId: z.string().min(1), locationId: z.string().min(1), label: z.string().max(60).optional() }).parse(input);
  return run(() => assignStand({ ...p, actorUserId: user.id }), "Support assigné.");
}

export async function setStandActiveAction(standId: string, active: boolean): Promise<Result> {
  const { user } = await requirePlatformAdmin();
  return run(() => setStandActive(z.string().min(1).parse(standId), active, user.id));
}

export async function unassignStandAction(standId: string): Promise<Result> {
  const { user } = await requirePlatformAdmin();
  return run(() => unassignStand(z.string().min(1).parse(standId), user.id), "Support remis en stock.");
}

/** Clients may rename their own stands ("Comptoir", "Terrasse"…); nothing else. */
export async function renameStandAction(standId: string, label: string): Promise<Result> {
  const { db } = await requireTenant();
  const p = z.object({ standId: z.string().min(1), label: z.string().trim().min(1).max(60) }).parse({ standId, label });
  await db.stand.update({ where: { id: p.standId }, data: { label: p.label } });
  revalidatePath("/supports");
  return { ok: true };
}
