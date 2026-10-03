import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { systemDb } from "@avis/db/system";
import { requirePlatformAdmin } from "@/server/session";
import { ImpersonateButton } from "./impersonate-button";

export const metadata: Metadata = { title: "Clients" };

/** Phase 1 client list (health scores, billing and stand management arrive in phase 7). */
export default async function AdminClientsPage() {
  await requirePlatformAdmin();
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);
  const orgs = await systemDb().organization.findMany({
    orderBy: { name: "asc" },
    include: {
      subscription: true,
      locations: { select: { id: true } },
      members: { where: { role: "owner" }, include: { user: { select: { id: true, name: true } } }, take: 1 },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.subtitle", { count: orgs.length })}</p>
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{t("admin.name")}</TableHead>
                <TableHead>{t("admin.locations")}</TableHead>
                <TableHead>{t("admin.plan")}</TableHead>
                <TableHead>{t("admin.status")}</TableHead>
                <TableHead>{t("admin.service")}</TableHead>
                <TableHead>{t("admin.since")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((o) => {
                const owner = o.members[0]?.user;
                const sub = o.subscription;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="pl-6 font-medium">{o.name}</TableCell>
                    <TableCell>{o.locations.length}</TableCell>
                    <TableCell>{sub?.plan ?? "–"}</TableCell>
                    <TableCell>
                      {sub ? (
                        <Badge variant={sub.status === "ACTIVE" || sub.status === "TRIALING" ? "success" : "destructive"}>
                          {t(`subscriptionStatus.${sub.status}`)}
                        </Badge>
                      ) : (
                        "–"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={o.serviceState === "ACTIVE" ? "secondary" : "destructive"}>{t(`serviceState.${o.serviceState}`)}</Badge>
                    </TableCell>
                    <TableCell>{o.onboardedAt ? format.dateTime(o.onboardedAt, { dateStyle: "medium" }) : "–"}</TableCell>
                    <TableCell className="pr-6 text-right">{owner && <ImpersonateButton userId={owner.id} name={owner.name} />}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
