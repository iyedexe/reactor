import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Prisma } from "@avis/db";
import { effectiveConsent } from "@avis/services";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";
import { fmtDate } from "@/lib/format";
import { requireTenant } from "@/server/session";
import { AddContactForm, ContactActions, ImportForm } from "./forms";

export const metadata: Metadata = { title: "Contacts" };
const PAGE_SIZE = 25;

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const { db } = await requireTenant();
  const [t, locale] = await Promise.all([getTranslations("contacts"), getLocale()]);
  const l = locale === "en" ? "en-GB" : "fr-FR";
  const where: Prisma.ContactWhereInput = q
    ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q.toLowerCase() } }, { phone: { contains: q.replace(/\s/g, "").replace(/^0/, "") } }] }
    : {};
  const [locations, total, contacts] = await Promise.all([
    db.location.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.contact.count({ where }),
    db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { consents: true, requests: { take: 1, orderBy: { createdAt: "desc" } }, location: { select: { name: true } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestLabel = (r: (typeof contacts)[number]["requests"][number] | undefined) => {
    if (!r) return t("request.none");
    if (r.attributedReviewId) return t("request.reviewed");
    if (r.status === "SCHEDULED") return t("request.scheduled", { date: fmtDate(r.scheduledAt.toISOString(), l, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) });
    if (r.status === "SKIPPED") return t("request.skipped", { reason: t(`skipReasons.${r.skipReason ?? "other"}`) });
    return t(`request.${r.status}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle", { count: total })}</p>
        </div>
        <form className="flex gap-2">
          <Input name="q" defaultValue={q} placeholder={t("search")} className="w-64" />
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("add.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AddContactForm locations={locations} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("import.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportForm locations={locations} />
          </CardContent>
        </Card>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{t("table.name")}</TableHead>
                <TableHead>{t("table.contact")}</TableHead>
                <TableHead>{t("table.consent")}</TableHead>
                <TableHead>{t("table.request")}</TableHead>
                <TableHead>{t("table.source")}</TableHead>
                <TableHead className="pr-6 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="pl-6">
                    <div className="font-medium">
                      {c.firstName} {c.lastName}
                    </div>
                    {locations.length > 1 && <div className="text-xs text-muted-foreground">{c.location.name}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{c.phone}</div>
                    <div className="text-muted-foreground">{c.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.phone && <Badge variant={effectiveConsent(c.consents, "SMS") ? "success" : "outline"}>SMS {effectiveConsent(c.consents, "SMS") ? "✓" : "✗"}</Badge>}
                      {c.email && <Badge variant={effectiveConsent(c.consents, "EMAIL") ? "success" : "outline"}>E-mail {effectiveConsent(c.consents, "EMAIL") ? "✓" : "✗"}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal">{requestLabel(c.requests[0])}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t(`sources.${c.source}`)}</TableCell>
                  <TableCell className="pr-6">
                    <ContactActions id={c.id} hasPhone={!!c.phone && effectiveConsent(c.consents, "SMS")} hasEmail={!!c.email && effectiveConsent(c.consents, "EMAIL")} />
                  </TableCell>
                </TableRow>
              ))}
              {contacts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    {t("empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Pagination
        page={page}
        pages={pages}
        href={(p) => `/contacts?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString()}`}
        labels={{ prev: t("prev"), next: t("next"), of: t("pageOf", { page, pages }) }}
      />
    </div>
  );
}
