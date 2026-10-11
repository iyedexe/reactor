import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Mail, Phone } from "lucide-react";
import type { Prisma } from "@avis/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FilterSelect } from "@/components/filter-select";
import { Pagination } from "@/components/pagination";
import { fmtDate } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { FeedbackActions } from "./feedback-actions";

export const metadata: Metadata = { title: "Messages privés" };
const PAGE_SIZE = 20;

export default async function FeedbackInboxPage({ searchParams }: PageProps<"/messages-prives">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const { db } = await requireTenant();
  const [t, locale] = await Promise.all([getTranslations("feedback"), getLocale()]);
  const l = locale === "en" ? "en-GB" : "fr-FR";
  const locations = await db.location.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  const statut = str("statut") || "boite";
  const where: Prisma.PrivateFeedbackWhereInput = statut === "archives" ? { status: "ARCHIVED" } : statut === "nouveaux" ? { status: "NEW" } : { status: { in: ["NEW", "READ"] } };
  if (str("lieu")) where.locationId = str("lieu");
  const page = Math.max(1, Number(str("page")) || 1);
  const [total, items, unread] = await Promise.all([
    db.privateFeedback.count({ where }),
    db.privateFeedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { location: { select: { name: true } }, stand: { select: { label: true } } },
    }),
    db.privateFeedback.count({ where: { status: "NEW" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    q.set("page", String(p));
    return `/messages-prives?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle", { count: unread })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {locations.length > 1 && (
            <FilterSelect name="lieu" value={str("lieu")} label={t("location")} options={[{ value: "", label: t("allLocations") }, ...locations.map((x) => ({ value: x.id, label: x.name }))]} />
          )}
          <FilterSelect
            name="statut"
            value={statut === "boite" ? "" : statut}
            label={t("status")}
            options={[
              { value: "", label: t("inbox") },
              { value: "nouveaux", label: t("onlyNew") },
              { value: "archives", label: t("archived") },
            ]}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t("explain")}</p>
      {items.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((f) => (
            <li key={f.id}>
              <Card className={`gap-3 py-4 ${f.status === "NEW" ? "border-primary/40" : ""}`}>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {f.status === "NEW" && <Badge>{t("new")}</Badge>}
                    <span className="text-muted-foreground">
                      {fmtDate(f.createdAt.toISOString(), l, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
                    </span>
                    {locations.length > 1 && <span className="text-muted-foreground">· {f.location.name}</span>}
                    {f.stand?.label && <span className="text-muted-foreground">· {t("viaStand", { label: f.stand.label })}</span>}
                    <span className="ml-auto">
                      <FeedbackActions id={f.id} status={f.status} />
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{f.message}</p>
                  {f.wantsReply && (f.contactEmail || f.contactPhone) && (
                    <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                      <span className="font-medium">{t("wantsReply", { name: f.contactName ?? "" })}</span>
                      {f.contactEmail && (
                        <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`mailto:${f.contactEmail}`}>
                          <Mail className="size-3.5" />
                          {f.contactEmail}
                        </a>
                      )}
                      {f.contactPhone && (
                        <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${f.contactPhone}`}>
                          <Phone className="size-3.5" />
                          {f.contactPhone}
                        </a>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pages={pages} href={href} labels={{ prev: t("prev"), next: t("next"), of: t("pageOf", { page, pages }) }} />
    </div>
  );
}
