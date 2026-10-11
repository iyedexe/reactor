"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCampaignAction } from "@/server/actions/campaigns";

export interface CampaignValues {
  id: string;
  name: string;
  channels: ("SMS" | "EMAIL")[];
  delayAfterVisitHours: number;
  reminderEnabled: boolean;
  reminderAfterDays: number;
  status: "ACTIVE" | "PAUSED" | "STOPPED";
}

export function CampaignForm({ campaign, canEdit }: { campaign: CampaignValues; canEdit: boolean }) {
  const t = useTranslations("campaigns.form");
  const [v, setV] = useState(campaign);
  const [pending, start] = useTransition();
  const toggle = (ch: "SMS" | "EMAIL") => setV((x) => ({ ...x, channels: x.channels.includes(ch) ? x.channels.filter((c) => c !== ch) : [...x.channels, ch] }));
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateCampaignAction({ ...v, status: v.status === "STOPPED" ? "PAUSED" : v.status });
          if (r.ok) toast.success(t("saved"));
          else toast.error(r.errors.join(" "));
        });
      }}
    >
      <fieldset disabled={!canEdit || pending} className="contents">
        <div className="space-y-2">
          <Label htmlFor={`name-${v.id}`}>{t("name")}</Label>
          <Input id={`name-${v.id}`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t("status")}</Label>
          <div className="flex gap-4 pt-2 text-sm">
            {(["ACTIVE", "PAUSED"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input type="radio" name={`status-${v.id}`} checked={v.status === s || (s === "PAUSED" && v.status === "STOPPED")} onChange={() => setV({ ...v, status: s })} />
                {t(`statuses.${s}`)}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("channels")}</Label>
          <div className="flex gap-4 pt-2 text-sm">
            {(["SMS", "EMAIL"] as const).map((ch) => (
              <label key={ch} className="flex items-center gap-2">
                <input type="checkbox" checked={v.channels.includes(ch)} onChange={() => toggle(ch)} />
                {ch === "SMS" ? "SMS" : "E-mail"}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("channelsHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`delay-${v.id}`}>{t("delay")}</Label>
          <Input id={`delay-${v.id}`} type="number" min={0} max={168} value={v.delayAfterVisitHours} onChange={(e) => setV({ ...v, delayAfterVisitHours: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground">{t("delayHint")}</p>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={v.reminderEnabled} onChange={(e) => setV({ ...v, reminderEnabled: e.target.checked })} />
            {t("reminder")}
          </label>
          <div className="flex items-center gap-2 text-sm">
            <Input type="number" min={1} max={14} className="w-20" disabled={!v.reminderEnabled} value={v.reminderAfterDays} onChange={(e) => setV({ ...v, reminderAfterDays: Number(e.target.value) })} />
            {t("reminderDays")}
          </div>
        </div>
        <div className="flex items-end justify-end">{canEdit && <Button type="submit">{t("save")}</Button>}</div>
      </fieldset>
    </form>
  );
}
