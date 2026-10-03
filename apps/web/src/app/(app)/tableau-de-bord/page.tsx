import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { MapPin, MessageSquareText, Star } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Tableau de bord" };

/** Phase 1 overview: proves auth + tenancy end to end. Replaced by the full dashboard in phase 2. */
export default async function DashboardPage() {
  const { db, user } = await requireTenant();
  const [t, format, locations] = await Promise.all([
    getTranslations("dashboard"),
    getFormatter(),
    db.location.findMany({ where: { status: "ACTIVE" }, include: { syncState: true }, orderBy: { name: "asc" } }),
  ]);
  const totalReviews = locations.reduce((s, l) => s + (l.googleReviewCount ?? 0), 0);
  const weighted = locations.reduce((s, l) => s + (l.googleRating ?? 0) * (l.googleReviewCount ?? 0), 0);
  const rating = totalReviews ? weighted / totalReviews : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("welcome", { name: user.name.split(" ")[0] ?? "" })}</h1>
        <p className="text-sm text-muted-foreground">{t("phaseNote")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi icon={<Star className="fill-star text-star" />} label={t("currentRating")} value={rating ? format.number(rating, { maximumFractionDigits: 1 }) : "–"} />
        <Kpi icon={<MessageSquareText />} label={t("totalReviews")} value={format.number(totalReviews)} />
        <Kpi icon={<MapPin />} label={t("locations")} value={String(locations.length)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {locations.map((l) => (
          <Card key={l.id}>
            <CardHeader>
              <CardTitle>{l.name}</CardTitle>
              <CardDescription>
                {l.address}, {l.city}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 font-medium">
                <Star className="size-4 fill-star text-star" />
                {l.googleRating ? format.number(l.googleRating, { maximumFractionDigits: 1 }) : "–"} · {l.googleReviewCount ?? 0} avis
              </span>
              <span className="text-muted-foreground">
                {l.syncState?.lastSuccessAt
                  ? t("syncedAt", { date: format.relativeTime(l.syncState.lastSuccessAt) })
                  : t("neverSynced")}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="flex flex-row items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </CardHeader>
      <CardContent className="text-3xl font-semibold tabular-nums">{value}</CardContent>
    </Card>
  );
}
