import { systemDb } from "@avis/db/system";
import { standUrls } from "@avis/services";
import { qrSvg } from "@/server/qr";
import { requirePlatformAdmin } from "@/server/session";
import { standFilter } from "../filter";
import { PrintButton } from "./print-button";

/** Printable sheet: one card per stand with its QR code (A4, 3 × 4 per page). */
export default async function PrintStandsPage({ searchParams }: PageProps<"/admin/supports/impression">) {
  await requirePlatformAdmin();
  const stands = await systemDb().stand.findMany({
    where: standFilter(await searchParams),
    orderBy: { code: "asc" },
    take: 120,
    include: { location: { select: { name: true } } },
  });
  const cards = await Promise.all(stands.map(async (s) => ({ ...s, svg: await qrSvg(standUrls(s.code).qr), url: standUrls(s.code).qr })));
  return (
    <div className="bg-white p-6 text-black print:p-0">
      <style>{`@page { size: A4; margin: 10mm } @media print { .no-print { display: none } }`}</style>
      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-sm">{cards.length} supports · imprimez sur A4, puis découpez.</p>
        <PrintButton />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.id} className="flex break-inside-avoid flex-col items-center rounded-lg border border-gray-300 p-4 text-center">
            <div className="text-sm font-semibold">Votre avis compte !</div>
            <div className="text-xs text-gray-600">Scannez ou approchez votre téléphone</div>
            <div className="my-2 w-40" dangerouslySetInnerHTML={{ __html: c.svg }} />
            <div className="font-mono text-xs">{c.code}</div>
            <div className="text-[10px] text-gray-500">{c.location?.name ?? "Non assigné"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
