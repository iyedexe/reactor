"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWebhookAction, deleteWebhookAction } from "@/server/actions/campaigns";

export function Webhooks({ hooks, locations, appUrl, canEdit }: {
  hooks: { id: string; name: string; location: string; lastUsedAt: string | null }[];
  locations: { id: string; name: string }[];
  appUrl: string;
  canEdit: boolean;
}) {
  const t = useTranslations("campaigns.webhooks");
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [created, setCreated] = useState<{ id: string; token: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4 text-sm">
      {hooks.length > 0 && (
        <ul className="divide-y rounded-md border">
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="flex-1">
                <div className="font-medium">{h.name}</div>
                <div className="font-mono text-xs break-all text-muted-foreground">
                  POST {appUrl}/api/webhooks/booking/{h.id}
                </div>
                <div className="text-xs text-muted-foreground">
                  {h.location} · {h.lastUsedAt ? t("lastUsed", { date: new Date(h.lastUsedAt).toLocaleString("fr-FR") }) : t("neverUsed")}
                </div>
              </div>
              {canEdit && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => void (await deleteWebhookAction(h.id)))}>
                  {t("delete")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {created && (
        <div className="space-y-1 rounded-md border border-warning bg-warning/10 p-3" role="status">
          <div className="font-medium">{t("tokenOnce")}</div>
          <code className="block break-all">Authorization: Bearer {created.token}</code>
          <code className="block break-all">POST {appUrl}/api/webhooks/booking/{created.id}</code>
        </div>
      )}
      {canEdit && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createWebhookAction(locationId, name || "Réservations");
              if (r.ok) setCreated({ id: r.id, token: r.token });
              else toast.error(r.errors.join(" "));
            });
          }}
        >
          <Input className="w-56" placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
          {locations.length > 1 && (
            <select className="h-9 rounded-md border bg-background px-2" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <Button type="submit" variant="outline" disabled={pending}>
            {t("create")}
          </Button>
        </form>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t("payloadTitle")}</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3">{`{
  "firstName": "Inès",
  "lastName": "Garnier",
  "phone": "+33612345678",
  "email": "ines@example.fr",
  "visitAt": "2026-10-13T10:00:00+02:00",
  "consentSms": true,
  "consentEmail": false,
  "externalId": "booking-1234"
}`}</pre>
      </details>
    </div>
  );
}
