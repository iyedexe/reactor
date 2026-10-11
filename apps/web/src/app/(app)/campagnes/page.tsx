import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { env, linksBaseUrl } from "@avis/core/env";
import { DEFAULT_TEMPLATES } from "@avis/core/templates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenant } from "@/server/session";
import { CampaignForm } from "./campaign-form";
import { TemplateEditor } from "./template-editor";
import { Webhooks } from "./webhooks";

export const metadata: Metadata = { title: "Campagnes" };

export default async function CampaignsPage() {
  const { db, role, organization } = await requireTenant();
  const t = await getTranslations("campaigns");
  const canEdit = role === "owner";
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [locations, campaigns, templates, hooks, sent, clicked, attributed] = await Promise.all([
    db.location.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.campaign.findMany({ include: { location: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    db.messageTemplate.findMany({ where: { organizationId: organization.id } }),
    db.inboundWebhook.findMany({ orderBy: { createdAt: "asc" } }),
    db.reviewRequest.groupBy({ by: ["campaignId"], where: { sentAt: { gte: since } }, _count: { _all: true } }),
    db.reviewRequest.groupBy({ by: ["campaignId"], where: { clickedAt: { gte: since } }, _count: { _all: true } }),
    db.reviewRequest.groupBy({ by: ["campaignId"], where: { attributedReviewId: { not: null }, sentAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const n = (arr: typeof sent, id: string) => arr.find((x) => x.campaignId === id)?._count._all ?? 0;
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const sample = {
    prenom: "Camille",
    entreprise: locations[0]?.name ?? organization.name,
    lien_avis: `${linksBaseUrl(env())}/m/aB3dEf7hJk`,
    stop: `${linksBaseUrl(env())}/u/aB3dEf7hJk`,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Card>
        <CardContent className="text-sm text-muted-foreground">{t("rules")}</CardContent>
      </Card>

      {campaigns.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle>{c.name}</CardTitle>
            <CardDescription>
              {locations.length > 1 ? `${c.location.name} · ` : ""}
              {t("stats30", { sent: n(sent, c.id), clicked: n(clicked, c.id), reviews: n(attributed, c.id) })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CampaignForm
              canEdit={canEdit}
              campaign={{ id: c.id, name: c.name, channels: c.channels, delayAfterVisitHours: c.delayAfterVisitHours, reminderEnabled: c.reminderEnabled, reminderAfterDays: c.reminderAfterDays, status: c.status }}
            />
          </CardContent>
        </Card>
      ))}
      {campaigns.length === 0 && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">{t("none")}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("templates.title")}</CardTitle>
          <CardDescription>{t("templates.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {(["SMS", "EMAIL"] as const).flatMap((channel) =>
            (["REQUEST", "REMINDER"] as const).map((kind) => {
              const own = templates.find((x) => x.channel === channel && x.kind === kind);
              const def = DEFAULT_TEMPLATES.find((x) => x.channel === channel && x.kind === kind)!;
              return (
                <TemplateEditor
                  key={`${channel}-${kind}`}
                  channel={channel}
                  kind={kind}
                  subject={own?.subject ?? def.subject}
                  body={own?.body ?? def.body}
                  custom={!!own}
                  canEdit={canEdit}
                  sample={sample}
                />
              );
            }),
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("webhooks.title")}</CardTitle>
          <CardDescription>{t("webhooks.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Webhooks
            canEdit={canEdit}
            appUrl={env().APP_URL.replace(/\/$/, "")}
            locations={locations}
            hooks={hooks.map((h) => ({ id: h.id, name: h.name, location: locName.get(h.locationId) ?? "", lastUsedAt: h.lastUsedAt?.toISOString() ?? null }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
