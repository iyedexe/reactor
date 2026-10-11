"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { checkTemplate, smsSegments } from "@avis/core/messages";
import { renderTemplate } from "@avis/core/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resetTemplateAction, saveTemplateAction } from "@/server/actions/campaigns";

export function TemplateEditor(props: {
  channel: "SMS" | "EMAIL";
  kind: "REQUEST" | "REMINDER";
  subject: string | null;
  body: string;
  custom: boolean;
  canEdit: boolean;
  sample: { prenom: string; entreprise: string; lien_avis: string; stop: string };
}) {
  const t = useTranslations("campaigns.templates");
  const [subject, setSubject] = useState(props.subject ?? "");
  const [body, setBody] = useState(props.body);
  const [pending, start] = useTransition();
  const check = useMemo(() => checkTemplate(body, props.channel === "EMAIL" ? subject : null), [body, subject, props.channel]);
  const preview = renderTemplate(body, props.sample) + (props.channel === "SMS" ? `\nSTOP : ${props.sample.stop}` : "");
  const seg = props.channel === "SMS" ? smsSegments(preview) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">{t(`${props.channel}.${props.kind}`)}</h4>
          {props.custom ? <Badge variant="secondary">{t("custom")}</Badge> : <Badge variant="outline">{t("default")}</Badge>}
        </div>
        {props.channel === "EMAIL" && (
          <div className="space-y-1">
            <Label>{t("subject")}</Label>
            <Input value={subject} disabled={!props.canEdit} onChange={(e) => setSubject(e.target.value)} />
          </div>
        )}
        <div className="space-y-1">
          <Label>{t("body")}</Label>
          <Textarea rows={props.channel === "SMS" ? 3 : 8} value={body} disabled={!props.canEdit} onChange={(e) => setBody(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("variables", { vars: "{{prenom}}, {{entreprise}}, {{lien_avis}}" })}</p>
        </div>
        {check.errors.length > 0 && (
          <ul className="space-y-1 text-sm text-destructive" role="alert">
            {check.errors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}
        {props.canEdit && (
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || check.errors.length > 0}
              onClick={() =>
                start(async () => {
                  const r = await saveTemplateAction({ channel: props.channel, kind: props.kind, subject: props.channel === "EMAIL" ? subject : null, body });
                  if (r.ok) toast.success(t("saved"));
                  else toast.error(r.errors.join(" "));
                })
              }
            >
              {t("save")}
            </Button>
            {props.custom && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => void (await resetTemplateAction(props.channel, props.kind)))}>
                {t("reset")}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>{t("preview")}</Label>
        <div className="rounded-lg border bg-muted/40 p-4 text-sm whitespace-pre-line">
          {props.channel === "EMAIL" && <div className="mb-2 font-medium">{renderTemplate(subject, props.sample)}</div>}
          {preview}
        </div>
        {seg && (
          <p className="text-xs text-muted-foreground">
            {t("segments", { length: seg.length, segments: seg.segments, encoding: seg.encoding })}
          </p>
        )}
      </div>
    </div>
  );
}
