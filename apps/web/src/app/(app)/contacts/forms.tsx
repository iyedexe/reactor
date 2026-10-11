"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ImportReport } from "@avis/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addContactAction, deleteContactAction, importContactsAction, optOutContactAction } from "@/server/actions/contacts";

type Loc = { id: string; name: string };

function LocationSelect({ locations, value, onChange }: { locations: Loc[]; value: string; onChange: (v: string) => void }) {
  const t = useTranslations("contacts");
  if (locations.length < 2) return null;
  return (
    <div className="space-y-1">
      <Label>{t("location")}</Label>
      <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AddContactForm({ locations }: { locations: Loc[] }) {
  const t = useTranslations("contacts.add");
  const [pending, start] = useTransition();
  const [f, setF] = useState({ locationId: locations[0]?.id ?? "", firstName: "", lastName: "", email: "", phone: "", consentSms: false, consentEmail: false, evidence: t("defaultEvidence") });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addContactAction(f);
          if (!r.ok) return void toast.error(r.error);
          toast.success(t(`result.${r.schedule.split(":")[0]}`, { reason: r.schedule.split(":")[1] ?? "" }));
          setF({ ...f, firstName: "", lastName: "", email: "", phone: "", consentSms: false, consentEmail: false });
        });
      }}
    >
      <LocationSelect locations={locations} value={f.locationId} onChange={(v) => setF({ ...f, locationId: v })} />
      <div className="space-y-1">
        <Label htmlFor="c-first">{t("firstName")}</Label>
        <Input id="c-first" required value={f.firstName} onChange={set("firstName")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-last">{t("lastName")}</Label>
        <Input id="c-last" value={f.lastName} onChange={set("lastName")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-phone">{t("phone")}</Label>
        <Input id="c-phone" type="tel" value={f.phone} onChange={set("phone")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-email">{t("email")}</Label>
        <Input id="c-email" type="email" value={f.email} onChange={set("email")} />
      </div>
      <fieldset className="space-y-2 rounded-md border p-3 sm:col-span-2">
        <legend className="px-1 text-sm font-medium">{t("consent")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.consentSms} onChange={set("consentSms")} /> {t("consentSms")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.consentEmail} onChange={set("consentEmail")} /> {t("consentEmail")}
        </label>
        <Input aria-label={t("evidence")} value={f.evidence} onChange={set("evidence")} />
        <p className="text-xs text-muted-foreground">{t("evidenceHint")}</p>
      </fieldset>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

export function ImportForm({ locations }: { locations: Loc[] }) {
  const t = useTranslations("contacts.import");
  const [pending, start] = useTransition();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [consent, setConsent] = useState({ sms: false, email: false });
  const [evidence, setEvidence] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await importContactsAction({ locationId, csv, consentSms: consent.sms, consentEmail: consent.email, evidence });
          if (!r.ok) return void toast.error(r.error);
          setReport(r.report);
        });
      }}
    >
      <LocationSelect locations={locations} value={locationId} onChange={setLocationId} />
      <div className="space-y-1">
        <Label htmlFor="csv">{t("file")}</Label>
        <Input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            setCsv(await file.text());
          }}
        />
        <p className="text-xs text-muted-foreground">{t("columns")}</p>
      </div>
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">{t("consent")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={consent.sms} onChange={(e) => setConsent({ ...consent, sms: e.target.checked })} /> {t("consentSms")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={consent.email} onChange={(e) => setConsent({ ...consent, email: e.target.checked })} /> {t("consentEmail")}
        </label>
        <Input required placeholder={t("evidencePlaceholder")} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </fieldset>
      <Button type="submit" disabled={pending || !csv}>
        {pending ? t("importing") : t("submit", { file: fileName || "CSV" })}
      </Button>
      {report && (
        <div className="rounded-md border p-3 text-sm" role="status">
          {t("report", { total: report.total, created: report.created, updated: report.updated, scheduled: report.scheduled })}
          {report.errors.length > 0 && (
            <ul className="mt-2 text-destructive">
              {report.errors.slice(0, 20).map((e) => (
                <li key={e.line}>{t("lineError", { line: e.line, reason: e.reason })}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

export function ContactActions({ id, hasPhone, hasEmail }: { id: string; hasPhone: boolean; hasEmail: boolean }) {
  const t = useTranslations("contacts.actions");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(msg);
      else toast.error(r.error);
    });
  return (
    <div className="flex justify-end gap-1">
      {hasPhone && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => optOutContactAction(id, "SMS"), t("optedOut"))}>
          {t("optOutSms")}
        </Button>
      )}
      {hasEmail && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => optOutContactAction(id, "EMAIL"), t("optedOut"))}>
          {t("optOutEmail")}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        onClick={() => {
          if (confirm(t("confirmDelete"))) run(() => deleteContactAction(id), t("deleted"));
        }}
      >
        {t("delete")}
      </Button>
    </div>
  );
}
