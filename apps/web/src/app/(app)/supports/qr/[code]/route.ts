import { standUrls } from "@avis/services";
import { qrSvg } from "@/server/qr";
import { requireTenant } from "@/server/session";

/** QR code of one of the client's own stands, as a downloadable SVG. */
export async function GET(_req: Request, ctx: RouteContext<"/supports/qr/[code]">) {
  const { code } = await ctx.params;
  const { db } = await requireTenant();
  const stand = await db.stand.findFirst({ where: { code } });
  if (!stand) return new Response("Not found", { status: 404 });
  return new Response(await qrSvg(standUrls(stand.code).qr), {
    headers: { "content-type": "image/svg+xml", "content-disposition": `attachment; filename="qr-${stand.code}.svg"` },
  });
}
