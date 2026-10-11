"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkTemplate } from "@avis/core/messages";
import { createBookingWebhook } from "@avis/services";
import { requireOwner } from "../session";

type Result<T = object> = ({ ok: true } & T) | { ok: false; errors: string[] };

const campaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  channels: z.array(z.enum(["SMS", "EMAIL"])).min(1, "Choisissez au moins un canal."),
  delayAfterVisitHours: z.coerce.number().int().min(0).max(168),
  reminderEnabled: z.boolean(),
  reminderAfterDays: z.coerce.number().int().min(1).max(14),
  status: z.enum(["ACTIVE", "PAUSED"]),
});

export async function updateCampaignAction(input: z.input<typeof campaignSchema>): Promise<Result> {
  const { db } = await requireOwner();
  const p = campaignSchema.safeParse(input);
  if (!p.success) return { ok: false, errors: p.error.issues.map((i) => i.message) };
  const { id, ...data } = p.data;
  await db.campaign.update({ where: { id }, data });
  revalidatePath("/campagnes");
  return { ok: true };
}

export async function createCampaignAction(locationId: string): Promise<Result> {
  const { db } = await requireOwner();
  const loc = await db.location.findUnique({ where: { id: z.string().parse(locationId) } });
  if (!loc) return { ok: false, errors: ["Établissement inconnu."] };
  await db.campaign.create({ data: { organizationId: db.organizationId, locationId: loc.id, name: "Après la visite", channels: ["SMS", "EMAIL"] } });
  revalidatePath("/campagnes");
  return { ok: true };
}

const templateSchema = z.object({
  channel: z.enum(["SMS", "EMAIL"]),
  kind: z.enum(["REQUEST", "REMINDER"]),
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(2000),
});

/** Saves the organization's own version of a template, after the policy checks (no incentive, no gating). */
export async function saveTemplateAction(input: z.input<typeof templateSchema>): Promise<Result> {
  const { db } = await requireOwner();
  const p = templateSchema.parse(input);
  if (p.channel === "EMAIL" && !p.subject?.trim()) return { ok: false, errors: ["L'objet de l'e-mail est obligatoire."] };
  const check = checkTemplate(p.body, p.subject);
  if (check.errors.length) return { ok: false, errors: check.errors };
  const existing = await db.messageTemplate.findFirst({ where: { organizationId: db.organizationId, channel: p.channel, kind: p.kind } });
  const name = `${p.channel === "SMS" ? "SMS" : "E-mail"} – ${p.kind === "REQUEST" ? "demande d'avis" : "relance"}`;
  if (existing) await db.messageTemplate.update({ where: { id: existing.id }, data: { subject: p.subject ?? null, body: p.body, name } });
  else await db.messageTemplate.create({ data: { organizationId: db.organizationId, channel: p.channel, kind: p.kind, subject: p.subject ?? null, body: p.body, name } });
  revalidatePath("/campagnes");
  return { ok: true };
}

export async function resetTemplateAction(channel: "SMS" | "EMAIL", kind: "REQUEST" | "REMINDER"): Promise<Result> {
  const { db } = await requireOwner();
  await db.messageTemplate.deleteMany({ where: { organizationId: db.organizationId, channel: z.enum(["SMS", "EMAIL"]).parse(channel), kind: z.enum(["REQUEST", "REMINDER"]).parse(kind) } });
  revalidatePath("/campagnes");
  return { ok: true };
}

export async function createWebhookAction(locationId: string, name: string): Promise<Result<{ id: string; token: string }>> {
  const { db } = await requireOwner();
  const loc = await db.location.findUnique({ where: { id: z.string().parse(locationId) } });
  if (!loc) return { ok: false, errors: ["Établissement inconnu."] };
  const hook = await createBookingWebhook(db, loc.id, z.string().max(80).parse(name));
  revalidatePath("/campagnes");
  return { ok: true, ...hook };
}

export async function deleteWebhookAction(id: string): Promise<Result> {
  const { db } = await requireOwner();
  await db.inboundWebhook.delete({ where: { id: z.string().parse(id) } });
  revalidatePath("/campagnes");
  return { ok: true };
}
