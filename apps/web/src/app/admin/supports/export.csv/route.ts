import { systemDb } from "@avis/db/system";
import { standUrls } from "@avis/services";
import { getSession, isPlatformAdmin } from "@/server/session";
import { standFilter } from "../filter";

/** CSV for the NFC encoding tool: one line per stand with the URL to write on the tag. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !isPlatformAdmin(session.user) || session.session.impersonatedBy) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const stands = await systemDb().stand.findMany({ where: standFilter(sp), orderBy: { code: "asc" }, include: { location: { select: { name: true, organization: { select: { name: true } } } } } });
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["code", "statut", "client", "etablissement", "libelle", "url_nfc", "url_qr"].join(";"),
    ...stands.map((s) => {
      const u = standUrls(s.code);
      return [s.code, s.status, s.location?.organization.name, s.location?.name, s.label, u.nfc, u.qr].map(cell).join(";");
    }),
  ];
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="supports-avisboost.csv"` },
  });
}
