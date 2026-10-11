import { optOutByToken } from "@avis/services";

/** One-click unsubscribe (RFC 8058): mail clients POST "List-Unsubscribe=One-Click" here. */
export async function POST(_req: Request, ctx: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  const res = await optOutByToken(token);
  return new Response(res ? "Unsubscribed" : "Unknown link", { status: res ? 200 : 404 });
}

export async function GET(req: Request, ctx: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  return Response.redirect(new URL(`/u/${token}`, req.url), 303);
}
