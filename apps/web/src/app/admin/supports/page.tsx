import type { Metadata } from "next";
import Link from "next/link";
import { systemDb } from "@avis/db/system";
import { standUrls } from "@avis/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterSelect } from "@/components/filter-select";
import { requirePlatformAdmin } from "@/server/session";
import { standFilter } from "./filter";
import { CreateStandsForm, StandRowActions } from "./stand-row-actions";

export const metadata: Metadata = { title: "Supports" };

const STATUS: Record<string, { label: string; variant: "secondary" | "success" | "destructive" | "outline" }> = {
  UNASSIGNED: { label: "En stock", variant: "outline" },
  ACTIVE: { label: "Actif", variant: "success" },
  INACTIVE: { label: "Désactivé", variant: "destructive" },
};

export default async function AdminStandsPage({ searchParams }: PageProps<"/admin/supports">) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const where = standFilter(sp);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const db = systemDb();
  const [stands, orgs, locations, scans] = await Promise.all([
    db.stand.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 500, include: { location: { select: { name: true, organization: { select: { name: true } } } } } }),
    db.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.location.findMany({ where: { status: "ACTIVE", organization: { serviceState: { not: "TERMINATED" } } }, orderBy: [{ organization: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, organization: { select: { name: true } } } }),
    db.linkEvent.groupBy({ by: ["standId"], where: { type: "SCAN", occurredAt: { gte: since }, standId: { not: null } }, _count: { _all: true } }),
  ]);
  const scanCount = new Map(scans.map((s) => [s.standId, s._count._all]));
  const query = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Supports NFC / QR</h1>
          <p className="text-sm text-muted-foreground">
            Chaque support a une adresse courte. La puce NFC et le QR code pointent vers la même adresse ; un support désactivé affiche une page neutre.
          </p>
        </div>
        <CreateStandsForm />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          name="statut"
          value={typeof sp.statut === "string" ? sp.statut : ""}
          label="Statut"
          options={[
            { value: "", label: "Tous les statuts" },
            { value: "stock", label: "En stock" },
            { value: "actifs", label: "Actifs" },
            { value: "inactifs", label: "Désactivés" },
          ]}
        />
        <FilterSelect name="client" value={typeof sp.client === "string" ? sp.client : ""} label="Client" options={[{ value: "", label: "Tous les clients" }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]} />
        <span className="ml-auto flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/supports/impression?${query}`} target="_blank">
              Imprimer les QR codes
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/admin/supports/export.csv?${query}`}>Exporter (CSV, URLs NFC)</a>
          </Button>
        </span>
      </div>
      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Code</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Client / établissement</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead className="text-right">Scans 30 j</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stands.map((s) => {
                const st = STATUS[s.status]!;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="pl-6">
                      <div className="font-mono text-sm">{s.code}</div>
                      <div className="text-xs text-muted-foreground">{standUrls(s.code).nfc}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {s.location ? (
                        <>
                          <div>{s.location.organization.name}</div>
                          <div className="text-xs text-muted-foreground">{s.location.name}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell>{s.label ?? "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{scanCount.get(s.id) ?? 0}</TableCell>
                    <TableCell className="pr-6">
                      <StandRowActions
                        stand={{ id: s.id, status: s.status, locationId: s.locationId, label: s.label }}
                        locations={locations.map((l) => ({ id: l.id, name: l.name, organization: l.organization.name }))}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {stands.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Aucun support.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
