import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getDashboard, isPeriodKey } from "@avis/services";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CompetitorChart, DistributionChart, RatingChart, ReviewsChart, TopicsChart } from "@/components/dashboard/charts";
import { DashboardFilters } from "@/components/dashboard/filters";
import { Funnel } from "@/components/dashboard/funnel";
import { ImpactSection } from "@/components/dashboard/impact";
import { KpiTile } from "@/components/dashboard/kpi";
import { SyncButton } from "@/components/dashboard/sync-button";
import { fmtDate, fmtHours, fmtNumber, fmtPct, fmtRating } from "@/lib/format";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Tableau de bord" };

function signed(n: number | null | undefined, fmt: (x: number) => string) {
  if (n == null) return undefined;
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;
}

export default async function DashboardPage({ searchParams }: PageProps<"/tableau-de-bord">) {
  const sp = await searchParams;
  const { db, user } = await requireTenant();
  const period = isPeriodKey(sp.periode) ? sp.periode : "90j";
  const lieu = typeof sp.lieu === "string" ? sp.lieu : null;
  const [d, t, locale] = await Promise.all([getDashboard(db, { period, locationId: lieu }), getTranslations("dashboard"), getLocale()]);
  const l = locale === "en" ? "en-GB" : "fr-FR";
  const vs = t("vsPrevious");
  const k = d.kpis;
  const lastSync = d.sync.map((s) => s.lastSuccessAt).filter(Boolean).sort().at(-1) ?? null;
  const singleLocation = d.selectedLocationId ?? (d.locations.length === 1 ? d.locations[0]!.id : null);
  const ownForChart = singleLocation ? { name: d.competitors.own.find((o) => o.id === singleLocation)?.name ?? "", series: d.series.map((p) => ({ date: p.date, rating: p.rating })) } : null;
  const competitorsForChart = singleLocation ? d.competitors.rows : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("welcome", { name: user.name.split(" ")[0] ?? "" })}</h1>
          <p className="text-sm text-muted-foreground">
            {lastSync ? t("syncedAt", { date: fmtDate(lastSync, l, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) }) : t("neverSynced")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardFilters locations={d.locations} locationId={d.selectedLocationId} period={d.period.key} />
          <SyncButton lastSync={lastSync} />
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiTile label={t("kpi.rating")} value={fmtRating(k.rating.value, l)} delta={k.rating.delta} deltaLabel={k.rating.delta != null ? `${signed(k.rating.delta, (x) => fmtNumber(x, l, 2))} ${vs}` : undefined} />
        <KpiTile label={t("kpi.totalReviews")} value={fmtNumber(k.totalReviews.value, l)} delta={k.totalReviews.delta} deltaLabel={k.totalReviews.delta != null ? `${signed(k.totalReviews.delta, (x) => fmtNumber(x, l))} ${t("inPeriod")}` : undefined} />
        <KpiTile label={t("kpi.thisMonth")} value={fmtNumber(k.reviewsThisMonth.value, l)} delta={k.reviewsThisMonth.delta} deltaLabel={`${signed(k.reviewsThisMonth.delta, (x) => fmtNumber(x, l)) ?? "0"} ${t("vsLastMonth")}`} />
        <KpiTile label={t("kpi.reviewsInPeriod")} value={fmtNumber(k.reviewsInPeriod.value, l)} delta={k.reviewsInPeriod.delta} deltaLabel={k.reviewsInPeriod.pct != null ? `${signed(k.reviewsInPeriod.pct, (x) => fmtPct(x, l))} ${vs}` : undefined} />
        <KpiTile label={t("kpi.responseRate")} value={fmtPct(k.responseRate.value, l)} delta={k.responseRate.delta} deltaLabel={k.responseRate.delta != null ? `${signed(k.responseRate.delta * 100, (x) => fmtNumber(x, l))} pts ${vs}` : undefined} />
        <KpiTile label={t("kpi.responseTime")} value={fmtHours(k.avgResponseHours.value, l)} delta={k.avgResponseHours.delta} goodWhen="down" deltaLabel={k.avgResponseHours.delta != null ? `${signed(k.avgResponseHours.delta, (x) => fmtHours(x, l))} ${vs}` : undefined} />
      </section>

      {d.impact && <ImpactSection impact={d.impact} />}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("charts.reviewsTitle")}</CardTitle>
            <CardDescription>{t(`charts.per.${d.period.granularity}`)}</CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewsChart data={d.series} granularity={d.period.granularity} joinedAt={d.organization.joinedAt} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("charts.ratingTitle")}</CardTitle>
            <CardDescription>{t("charts.ratingHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <RatingChart data={d.series} granularity={d.period.granularity} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("charts.distributionTitle")}</CardTitle>
            <CardDescription>{t("charts.inPeriodCount", { count: d.distribution.reduce((s, x) => s + x.count, 0) })}</CardDescription>
          </CardHeader>
          <CardContent>
            <DistributionChart data={d.distribution} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("charts.topicsTitle")}</CardTitle>
            <CardDescription>{t("charts.topicsHint")}</CardDescription>
          </CardHeader>
          <CardContent>{d.topics.length ? <TopicsChart data={d.topics} /> : <p className="text-sm text-muted-foreground">{t("empty")}</p>}</CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("funnel.standsTitle")}</CardTitle>
            <CardDescription>{t("funnel.estimatedHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Funnel
              locale={l}
              steps={[
                { label: t("funnel.scans"), value: d.funnels.stands.scans },
                { label: t("funnel.googleClicks"), value: d.funnels.stands.googleClicks },
                { label: t("funnel.estimatedReviews"), value: d.funnels.stands.estimatedReviews },
              ]}
            />
            <p className="mt-4 text-sm text-muted-foreground">{t("funnel.feedbacks", { count: d.funnels.stands.feedbacks })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("funnel.messagesTitle")}</CardTitle>
            <CardDescription>{t("funnel.estimatedHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Funnel
              locale={l}
              steps={[
                { label: t("funnel.sent"), value: d.funnels.messages.sent },
                { label: t("funnel.clicked"), value: d.funnels.messages.clicked },
                { label: t("funnel.estimatedReviews"), value: d.funnels.messages.estimatedReviews },
              ]}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 2xl:grid-cols-2">
        <Card className="pb-2">
          <CardHeader>
            <CardTitle>{t("stands.title")}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {d.byStand.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">{t("stands.stand")}</TableHead>
                    <TableHead className="text-right">{t("stands.scans")}</TableHead>
                    <TableHead className="text-right">{t("stands.clicks")}</TableHead>
                    <TableHead className="text-right">{t("stands.reviews")}</TableHead>
                    <TableHead className="pr-6 text-right">{t("stands.conversion")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.byStand.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-6">
                        <div className="font-medium">{s.label}</div>
                        {d.locations.length > 1 && <div className="text-xs text-muted-foreground">{s.location}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNumber(s.scans, l)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNumber(s.googleClicks, l)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNumber(s.estimatedReviews, l)}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{fmtPct(s.conversion, l, 1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-6 text-sm text-muted-foreground">{t("stands.none")}</p>
            )}
          </CardContent>
        </Card>
        <Card className="pb-2">
          <CardHeader>
            <CardTitle>{t("campaigns.title")}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {d.byCampaign.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">{t("campaigns.campaign")}</TableHead>
                    <TableHead className="text-right">{t("campaigns.sent")}</TableHead>
                    <TableHead className="text-right">{t("campaigns.clicked")}</TableHead>
                    <TableHead className="text-right">{t("campaigns.reviews")}</TableHead>
                    <TableHead className="pr-6 text-right">{t("campaigns.conversion")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.byCampaign.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-6">
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.channels.join(" + ")}
                          {d.locations.length > 1 ? ` · ${c.location}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNumber(c.sent, l)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNumber(c.clicked, l)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNumber(c.estimatedReviews, l)}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{fmtPct(c.conversion, l, 1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-6 text-sm text-muted-foreground">{t("campaigns.none")}</p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="pb-2">
        <CardHeader>
          <CardTitle>{t("competitors.title")}</CardTitle>
          <CardDescription>{singleLocation ? t("competitors.hint") : t("competitors.pickLocation")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          {ownForChart && competitorsForChart.length > 0 && (
            <div className="px-6">
              <CompetitorChart own={ownForChart} competitors={competitorsForChart} />
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{t("competitors.business")}</TableHead>
                <TableHead className="text-right">{t("competitors.rating")}</TableHead>
                <TableHead className="text-right">{t("competitors.reviews")}</TableHead>
                <TableHead className="text-right">{t("competitors.newReviews")}</TableHead>
                <TableHead className="pr-6 text-right">{t("competitors.distance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.competitors.own.map((o) => (
                <TableRow key={o.id} className="bg-primary/5">
                  <TableCell className="pl-6 font-medium">
                    {o.name} <Badge variant="secondary" className="ml-1">{t("competitors.you")}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtRating(o.rating, l)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNumber(o.reviewCount, l)}</TableCell>
                  <TableCell className="text-right tabular-nums">{signed(o.reviewDelta, (x) => fmtNumber(x, l)) ?? "–"}</TableCell>
                  <TableCell className="pr-6 text-right">–</TableCell>
                </TableRow>
              ))}
              {d.competitors.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-6">
                    <div>{c.name}</div>
                    {d.locations.length > 1 && !singleLocation && <div className="text-xs text-muted-foreground">{c.location}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtRating(c.rating, l)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtNumber(c.reviewCount, l)}</TableCell>
                  <TableCell className="text-right tabular-nums">{signed(c.reviewDelta, (x) => fmtNumber(x, l)) ?? "–"}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">{c.distanceM != null ? `${fmtNumber(c.distanceM, l)} m` : "–"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("estimatedFootnote")} <Link className="underline" href="/avis">{t("seeReviews")}</Link>
      </p>
    </div>
  );
}
