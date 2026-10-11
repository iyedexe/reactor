import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { MessageSquareReply, ShieldAlert } from "lucide-react";
import type { Prisma } from "@avis/db";
import { addDays, dateFromKey, dateKeyInTz, localDayRange } from "@avis/core/dates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FilterSelect } from "@/components/filter-select";
import { Pagination } from "@/components/pagination";
import { Stars } from "@/components/stars";
import { fmtDate } from "@/lib/format";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Avis" };
const PAGE_SIZE = 20;

export default async function ReviewsPage({ searchParams }: PageProps<"/avis">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const { db } = await requireTenant();
  const [t, tt, locale] = await Promise.all([getTranslations("reviews"), getTranslations("topics"), getLocale()]);
  const l = locale === "en" ? "en-GB" : "fr-FR";

  const locations = await db.location.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const where: Prisma.ReviewWhereInput = { removedAt: null };
  if (str("lieu")) where.locationId = str("lieu");
  const stars = Number(str("note"));
  if (stars >= 1 && stars <= 5) where.rating = stars;
  else if (str("note") === "negatifs") where.rating = { lte: 3 };
  const etat = str("etat");
  if (etat === "repondu") where.replyState = "ANSWERED";
  else if (etat === "sans-reponse") where.replyState = { in: ["UNANSWERED", "DRAFTED"] };
  else if (etat === "a-valider") where.replyState = "PENDING_APPROVAL";
  const days = { "7j": 7, "30j": 30, "90j": 90, "12m": 365 }[str("periode")];
  if (days) {
    const today = dateFromKey(dateKeyInTz(new Date()));
    where.createdAtGoogle = localDayRange(dateKeyInTz(addDays(today, -(days - 1)), "UTC"), dateKeyInTz(today, "UTC"));
  }
  const page = Math.max(1, Number(str("page")) || 1);
  const [total, reviews] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy: { createdAtGoogle: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        location: { select: { name: true } },
        classification: true,
        violation: true,
        replies: { where: { status: { in: ["PUBLISHED", "PENDING_APPROVAL", "DRAFT"] } }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    q.set("page", String(p));
    return `/avis?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("count", { count: total })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {locations.length > 1 && (
            <FilterSelect name="lieu" value={str("lieu")} label={t("filters.location")} options={[{ value: "", label: t("filters.allLocations") }, ...locations.map((x) => ({ value: x.id, label: x.name }))]} />
          )}
          <FilterSelect
            name="note"
            value={str("note")}
            label={t("filters.stars")}
            options={[
              { value: "", label: t("filters.allStars") },
              { value: "negatifs", label: t("filters.negative") },
              ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} ★` })),
            ]}
          />
          <FilterSelect
            name="etat"
            value={etat}
            label={t("filters.state")}
            options={[
              { value: "", label: t("filters.allStates") },
              { value: "sans-reponse", label: t("filters.unanswered") },
              { value: "a-valider", label: t("filters.pending") },
              { value: "repondu", label: t("filters.answered") },
            ]}
          />
          <FilterSelect
            name="periode"
            value={str("periode")}
            label={t("filters.period")}
            options={[
              { value: "", label: t("filters.allTime") },
              { value: "7j", label: t("filters.d7") },
              { value: "30j", label: t("filters.d30") },
              { value: "90j", label: t("filters.d90") },
              { value: "12m", label: t("filters.m12") },
            ]}
          />
        </div>
      </div>

      {reviews.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => {
            const reply = r.replies[0];
            const flagged = r.classification && r.classification.category !== "NONE";
            return (
              <li key={r.id}>
                <Card className="gap-3 py-4">
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <Stars value={r.rating} />
                      <span className="font-medium">{r.authorName}</span>
                      <span className="text-muted-foreground">{fmtDate(r.createdAtGoogle.toISOString(), l, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}</span>
                      {locations.length > 1 && <span className="text-muted-foreground">· {r.location.name}</span>}
                      <span className="ml-auto flex flex-wrap gap-1">
                        {r.replyState === "ANSWERED" && <Badge variant="success">{t("state.answered")}</Badge>}
                        {r.replyState === "PENDING_APPROVAL" && <Badge variant="warning">{t("state.pending")}</Badge>}
                        {r.replyState === "DRAFTED" && <Badge variant="secondary">{t("state.drafted")}</Badge>}
                        {r.replyState === "UNANSWERED" && <Badge variant="outline">{t("state.unanswered")}</Badge>}
                        {flagged && (
                          <Badge variant="destructive">
                            <ShieldAlert />
                            {t(`policy.${r.classification!.category}`)}
                          </Badge>
                        )}
                      </span>
                    </div>
                    {r.comment ? <p className="text-sm leading-relaxed">{r.comment}</p> : <p className="text-sm italic text-muted-foreground">{t("noComment")}</p>}
                    {r.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {r.topics.map((topic) => (
                          <Badge key={topic} variant="secondary" className="font-normal">
                            {tt(topic)}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {reply && (
                      <div className="rounded-md border-l-2 border-primary/40 bg-muted/40 p-3 text-sm">
                        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <MessageSquareReply className="size-3.5" />
                          {reply.status === "PUBLISHED"
                            ? t("reply.published", { date: fmtDate((reply.publishedAt ?? reply.createdAt).toISOString(), l, { day: "numeric", month: "short", timeZone: "Europe/Paris" }) })
                            : t("reply.draft")}
                        </div>
                        <p className="whitespace-pre-line">{reply.body}</p>
                      </div>
                    )}
                    {flagged && r.classification && (
                      <p className="text-xs text-muted-foreground">
                        {t("policy.explanation", { confidence: Math.round(r.classification.confidence * 100) })} {r.classification.explanation}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} pages={pages} href={href} labels={{ prev: t("prev"), next: t("next"), of: t("pageOf", { page, pages }) }} />
    </div>
  );
}
