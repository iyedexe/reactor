"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ContactError, deleteContact, importContactsCsv, optOut, upsertContact, type ImportReport } from "@avis/services";
import { requireTenant } from "../session";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const addSchema = z.object({
  locationId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  consentSms: z.boolean(),
  consentEmail: z.boolean(),
  evidence: z.string().trim().min(3, "Indiquez comment le client a donné son accord.").max(300),
  visitAt: z.string().optional(),
});

/** Manual entry at the counter. Consent must be explicit and its evidence recorded. */
export async function addContactAction(input: z.input<typeof addSchema>): Promise<Result<{ schedule: string }>> {
  const { db, user } = await requireTenant();
  const p = addSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  try {
    const res = await upsertContact(db, {
      locationId: p.data.locationId,
      firstName: p.data.firstName,
      lastName: p.data.lastName || null,
      email: p.data.email || null,
      phone: p.data.phone || null,
      source: "MANUAL",
      consent: { sms: p.data.consentSms, email: p.data.consentEmail },
      consentEvidence: p.data.evidence,
      consentSource: `manual:${user.id}`,
      visitAt: p.data.visitAt ? new Date(p.data.visitAt) : new Date(),
    });
    revalidatePath("/contacts");
    return { ok: true, schedule: res.schedule?.status === "skipped" ? `skipped:${res.schedule.reason}` : (res.schedule?.status ?? "none") };
  } catch (e) {
    if (e instanceof ContactError) return { ok: false, error: e.message };
    throw e;
  }
}

const importSchema = z.object({
  locationId: z.string().min(1),
  csv: z.string().min(1).max(2_000_000),
  consentEmail: z.boolean(),
  consentSms: z.boolean(),
  evidence: z.string().trim().min(3, "Indiquez comment les clients ont donné leur accord.").max(300),
});

export async function importContactsAction(input: z.input<typeof importSchema>): Promise<Result<{ report: ImportReport }>> {
  const { db, user } = await requireTenant();
  const p = importSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]!.message };
  try {
    const report = await importContactsCsv(db, {
      locationId: p.data.locationId,
      csv: p.data.csv,
      declaredConsent: { email: p.data.consentEmail, sms: p.data.consentSms },
      evidence: p.data.evidence,
      importedBy: user.id,
    });
    revalidatePath("/contacts");
    return { ok: true, report };
  } catch (e) {
    if (e instanceof ContactError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function optOutContactAction(contactId: string, channel: "SMS" | "EMAIL"): Promise<Result> {
  const { db, user } = await requireTenant();
  const c = await db.contact.findUnique({ where: { id: z.string().parse(contactId) } });
  if (!c) return { ok: false, error: "Contact introuvable." };
  const value = channel === "SMS" ? c.phone : c.email;
  if (!value) return { ok: false, error: "Pas de coordonnée pour ce canal." };
  await optOut(db.organizationId, z.enum(["SMS", "EMAIL"]).parse(channel), value, "MANUAL", `manual:${user.id}`);
  revalidatePath("/contacts");
  return { ok: true };
}

/** GDPR erasure. Opt-outs are kept as hashes so the person is never messaged again. */
export async function deleteContactAction(contactId: string): Promise<Result> {
  const { db } = await requireTenant();
  await deleteContact(db, z.string().parse(contactId));
  revalidatePath("/contacts");
  return { ok: true };
}
