import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace from the monorepo root so workspace packages end up in the standalone bundle.
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  // pg/pino use native Node resolution; Prisma's generated client stays bundled with @avis/db.
  serverExternalPackages: ["pg", "pino", "@prisma/adapter-pg"],
  poweredByHeader: false,
  typedRoutes: false,
  // In development the links service runs separately (pnpm dev, port 3002); in production Caddy routes /r/ and /m/.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    const target = process.env.LINKS_DEV_URL ?? "http://localhost:3002";
    return [
      { source: "/r/:path*", destination: `${target}/r/:path*` },
      { source: "/m/:path*", destination: `${target}/m/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
