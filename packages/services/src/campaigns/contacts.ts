import type { TenantDb } from "@avis/db";
import { TZDate } from "@date-fns/tz";
import { normalizeEmail, normalizePhone } from "@avis/core/contact";
import { effectiveConsent, type Channel } from "./optout.ts";
import { scheduleRequestForVisit, type ScheduleOutcome } from "./schedule.ts";

export class ContactError extends Error {}

export interface ContactInput {
  locationId: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  source: "MANUAL" | "CSV" | "WEBHOOK";
  /** Explicit consent per channel, as collected by the business (true = granted, false = refused). */
  consent?: { email?: boolean; sms?: boolean };
  /** Where/how consent was collected (shown in audits), e.g. the checkbox wording. */
  consentEvidence?: string | null;
  consentSource: string;
  visitAt?: Date | null;
}

export interface UpsertResult {
  contactId: string;
  created: boolean;
  schedule?: ScheduleOutcome;
}

/** Creates or updates a contact (matched by e-mail, then phone, then external id), logs consent, and schedules the request after a visit. */
export async function upsertContact(db: TenantDb, input: ContactInput, now = new Date()): Promise<UpsertResult> {
  const firstName = input.firstName.trim().slice(0, 80);
  if (!firstName) throw new ContactError("Le prénom est obligatoire.");
  const email = input.email ? normalizeEmail(input.email) : null;
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.email && !email) throw new ContactError("Adresse e-mail invalide.");
  if (input.phone && !phone) throw new ContactError("Numéro de téléphone invalide.");
  if (!email && !phone) throw new ContactError("Un e-mail ou un téléphone est nécessaire.");
  const location = await db.location.findUnique({ where: { id: input.locationId } });
  if (!location) throw new ContactError("Établissement inconnu.");

  const match = await db.contact.findFirst({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
        ...(input.externalId ? [{ externalId: input.externalId, locationId: input.locationId }] : []),
      ],
    },
    include: { consents: true },
  });

  const data = {
    firstName,
    lastName: input.lastName?.trim().slice(0, 80) || null,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(input.externalId ? { externalId: input.externalId } : {}),
  };
  let contactId: string;
  let created = false;
  let consents: { channel: Channel; action: "GRANTED" | "WITHDRAWN"; createdAt: Date }[] = [];
  if (match) {
    contactId = match.id;
    consents = match.consents;
    await db.contact.update({ where: { id: match.id }, data });
  } else {
    const c = await db.contact.create({ data: { organizationId: db.organizationId, locationId: input.locationId, source: input.source, ...data } });
    contactId = c.id;
    created = true;
  }

  // Consent log: only for channels we can actually reach, and only when the state changes.
  const hasEmail = !!(email ?? match?.email);
  const hasPhone = !!(phone ?? match?.phone);
  for (const [channel, granted] of [["EMAIL", input.consent?.email], ["SMS", input.consent?.sms]] as const) {
    if (granted === undefined) continue;
    if ((channel === "EMAIL" && !hasEmail) || (channel === "SMS" && !hasPhone)) continue;
    if (effectiveConsent(consents, channel) === granted && consents.some((c) => c.channel === channel)) continue;
    await db.consentEvent.create({
      data: { organizationId: db.organizationId, contactId, channel, action: granted ? "GRANTED" : "WITHDRAWN", source: input.consentSource, evidence: input.consentEvidence ?? null },
    });
  }

  const result: UpsertResult = { contactId, created };
  if (input.visitAt) result.schedule = await scheduleRequestForVisit(db, contactId, input.visitAt, { now });
  return result;
}

/** GDPR erasure: deletes the contact and its history; opt-outs remain (stored as hashes). */
export async function deleteContact(db: TenantDb, contactId: string) {
  await db.consentEvent.deleteMany({ where: { contactId } });
  await db.reviewRequest.deleteMany({ where: { contactId } });
  await db.contact.delete({ where: { id: contactId } });
}

// ───────────────────────────── CSV import ─────────────────────────────

const HEADERS: Record<string, keyof Row> = {
  prenom: "firstName",
  "prénom": "firstName",
  firstname: "firstName",
  first_name: "firstName",
  nom: "lastName",
  lastname: "lastName",
  last_name: "lastName",
  email: "email",
  "e-mail": "email",
  mail: "email",
  telephone: "phone",
  "téléphone": "phone",
  tel: "phone",
  phone: "phone",
  mobile: "phone",
  portable: "phone",
  consentement_email: "consentEmail",
  consent_email: "consentEmail",
  consentement_sms: "consentSms",
  consent_sms: "consentSms",
  date_visite: "visitAt",
  visite: "visitAt",
  visit_date: "visitAt",
  date: "visitAt",
};

interface Row {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  consentEmail?: string;
  consentSms?: string;
  visitAt?: string;
}

/** Minimal RFC 4180 parser; delimiter auto-detected (`;` is common in French Excel exports). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const YES = /^(oui|yes|y|o|1|true|vrai|x)$/i;
const NO = /^(non|no|n|0|false|faux)$/i;

function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  if (YES.test(v.trim())) return true;
  if (NO.test(v.trim())) return false;
  return undefined;
}

/** Accepts 2026-10-12, 2026-10-12 14:30, 12/10/2026, 12/10/2026 14h30 (French day/month order), in local time. */
export function parseVisitDate(v: string | undefined, tz = "Europe/Paris"): Date | null {
  if (!v?.trim()) return null;
  const s = v.trim();
  const at = (y: number, mo: number, d: number, h?: string, mi?: string) =>
    new Date(new TZDate(y, mo - 1, d, h ? +h : 12, mi ? +mi : 0, 0, tz).getTime());
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return at(+m[1]!, +m[2]!, +m[3]!, m[4], m[5]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})[:h](\d{2}))?/);
  if (m) return at(+m[3]!, +m[2]!, +m[1]!, m[4], m[5]);
  return null;
}

export interface ImportReport {
  total: number;
  created: number;
  updated: number;
  scheduled: number;
  errors: { line: number; reason: string }[];
}

/**
 * CSV import. Consent comes from per-row columns (consentement_email / consentement_sms) or, when absent,
 * from the importer's explicit declaration for the whole file. Rows without consent are imported but never messaged.
 */
export async function importContactsCsv(
  db: TenantDb,
  opts: { locationId: string; csv: string; declaredConsent?: { email: boolean; sms: boolean } | null; evidence: string; importedBy: string; now?: Date },
): Promise<ImportReport> {
  const rows = parseCsv(opts.csv);
  const report: ImportReport = { total: 0, created: 0, updated: 0, scheduled: 0, errors: [] };
  if (rows.length < 2) {
    report.errors.push({ line: 1, reason: "Fichier vide ou sans en-tête." });
    return report;
  }
  if (rows.length > 5001) throw new ContactError("5000 lignes maximum par import.");
  const header = rows[0]!.map((h) => HEADERS[h.trim().toLowerCase()]);
  if (!header.includes("firstName")) throw new ContactError("Colonne « prenom » introuvable.");
  if (!header.includes("email") && !header.includes("phone")) throw new ContactError("Colonne « email » ou « telephone » introuvable.");

  for (let i = 1; i < rows.length; i++) {
    report.total++;
    const r: Row = {};
    rows[i]!.forEach((v, j) => {
      const k = header[j];
      if (k) r[k] = v.trim();
    });
    try {
      const consent = {
        email: parseBool(r.consentEmail) ?? opts.declaredConsent?.email,
        sms: parseBool(r.consentSms) ?? opts.declaredConsent?.sms,
      };
      const res = await upsertContact(
        db,
        {
          locationId: opts.locationId,
          firstName: r.firstName ?? "",
          lastName: r.lastName,
          email: r.email || null,
          phone: r.phone || null,
          source: "CSV",
          consent,
          consentEvidence: opts.evidence,
          consentSource: `csv:${opts.importedBy}`,
          visitAt: parseVisitDate(r.visitAt),
        },
        opts.now,
      );
      if (res.created) report.created++;
      else report.updated++;
      if (res.schedule?.status === "scheduled") report.scheduled++;
    } catch (e) {
      report.errors.push({ line: i + 1, reason: e instanceof ContactError ? e.message : "Ligne invalide." });
    }
  }
  return report;
}
