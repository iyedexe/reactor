import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Download, ExternalLink } from "lucide-react";
import { standUrls } from "@avis/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireTenant } from "@/server/session";
import { RenameStand } from "./rename";

export const metadata: Metadata = { title: "Supports NFC/QR" };

export default async function StandsPage() {
  const { db } = await requireTenant();
  const t = await getTranslations("stands");
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [stands, scans, clicks, locations] = await Promise.all([
    db.stand.findMany({ include: { location: { select: { name: true } } }, orderBy: [{ status: "asc" }, { label: "asc" }] }),
    db.linkEvent.groupBy({ by: ["standId"], where: { type: "SCAN", occurredAt: { gte: since }, standId: { not: null } }, _count: { _all: true } }),
    db.linkEvent.groupBy({ by: ["standId"], where: { type: "GOOGLE_CLICK", occurredAt: { gte: since }, standId: { not: null } }, _count: { _all: true } }),
    db.location.count({ where: { status: "ACTIVE" } }),
  ]);
  const n = (arr: typeof scans, id: string) => arr.find((x) => x.standId === id)?._count._all ?? 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{t("label")}</TableHead>
                {locations > 1 && <TableHead>{t("location")}</TableHead>}
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("scans30")}</TableHead>
                <TableHead className="text-right">{t("clicks30")}</TableHead>
                <TableHead className="pr-6 text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stands.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-6">
                    <RenameStand id={s.id} label={s.label ?? s.code} />
                    <div className="font-mono text-xs text-muted-foreground">{s.code}</div>
                  </TableCell>
                  {locations > 1 && <TableCell>{s.location?.name}</TableCell>}
                  <TableCell>
                    <Badge variant={s.status === "ACTIVE" ? "success" : "destructive"}>{t(`statusValues.${s.status}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{n(scans, s.id)}</TableCell>
                  <TableCell className="text-right tabular-nums">{n(clicks, s.id)}</TableCell>
                  <TableCell className="pr-6">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="ghost">
                        <a href={standUrls(s.code).qr} target="_blank" rel="noreferrer">
                          <ExternalLink />
                          {t("preview")}
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a href={`/supports/qr/${s.code}`}>
                          <Download />
                          {t("downloadQr")}
                        </a>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {stands.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    {t("none")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{t("policy")}</p>
    </div>
  );
}
