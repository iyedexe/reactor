import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate, fmtHours, fmtNumber, fmtPct, fmtRating } from "@/lib/format";
import type { DashboardData } from "@avis/services";

/** "Impact since you joined": baseline snapshot at onboarding vs now. */
export async function ImpactSection({ impact }: { impact: NonNullable<DashboardData["impact"]> }) {
  const [t, locale] = await Promise.all([getTranslations("dashboard.impact"), getLocale()]);
  const l = locale === "en" ? "en-GB" : "fr-FR";
  const items = [
    { label: t("rating"), before: fmtRating(impact.before.rating, l), now: fmtRating(impact.now.rating, l) },
    { label: t("reviews"), before: fmtNumber(impact.before.reviewCount, l), now: fmtNumber(impact.now.reviewCount, l) },
    { label: t("velocity"), before: fmtNumber(impact.before.velocityPerWeek, l, 1), now: fmtNumber(impact.now.velocityPerWeek, l, 1), unit: t("perWeek") },
    { label: t("responseRate"), before: fmtPct(impact.before.responseRate, l), now: fmtPct(impact.now.responseRate, l) },
    { label: t("responseTime"), before: fmtHours(impact.before.avgResponseHours, l), now: fmtHours(impact.now.avgResponseHours, l) },
  ];
  const multiplier = impact.before.velocityPerWeek > 0 ? impact.now.velocityPerWeek / impact.before.velocityPerWeek : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("subtitle", { date: fmtDate(impact.joinedAt, l, { day: "numeric", month: "long", year: "numeric" }) })}
          {multiplier && multiplier >= 1.2 ? ` · ${t("multiplier", { x: fmtNumber(multiplier, l, 1) })}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((i) => (
          <div key={i.label} className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">{i.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">{i.before}</span>
              <ArrowRight className="size-3.5 self-center text-muted-foreground" aria-label={t("to")} />
              <span className="text-xl font-semibold">{i.now}</span>
              {i.unit && <span className="text-xs text-muted-foreground">{i.unit}</span>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
