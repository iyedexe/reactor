import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin, magicLink } from "better-auth/plugins";
import { audit, systemDb } from "@avis/db/system";
import { adapters } from "@avis/adapters";
import { env } from "@avis/core/env";
import { magicLinkEmail, resetPasswordEmail } from "./emails";

const e = env();

/**
 * Better Auth: email + password and magic links, stored in Postgres via Prisma.
 * Public sign-up is disabled: client accounts are created by the platform admin (or by Stripe checkout,
 * phase 7). The admin plugin provides platform-admin role, banning and impersonation.
 */
export const auth = betterAuth({
  appName: "AvisBoost",
  baseURL: e.APP_URL,
  secret: e.APP_SECRET,
  database: prismaAdapter(systemDb(), { provider: "postgresql" }),
  telemetry: { enabled: false },
  user: {
    additionalFields: {
      phone: { type: "string", required: false, input: false },
      locale: { type: "string", required: false, defaultValue: "fr", input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    sendResetPassword: async ({ user, url }) => {
      await adapters().messaging.sendEmail(resetPasswordEmail(user.email, user.name, url));
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Every support impersonation is recorded in the audit log.
        after: async (session) => {
          const s = session as typeof session & { impersonatedBy?: string | null };
          if (!s.impersonatedBy) return;
          const member = await systemDb().member.findFirst({ where: { userId: s.userId }, orderBy: { createdAt: "asc" } });
          await audit({
            organizationId: member?.organizationId,
            actorUserId: s.impersonatedBy,
            action: "admin.impersonate.start",
            entity: "User",
            entityId: s.userId,
          });
        },
      },
    },
  },
  // Sign-in/sign-up are limited to 3 attempts per 10 s per client IP in production.
  rateLimit: { enabled: e.AUTH_RATE_LIMIT ?? e.NODE_ENV === "production", storage: "memory" },
  advanced: {
    ipAddress: {
      // Requests arrive through Caddy (and possibly cloudflared). Trusting private ranges lets Better Auth
      // skip those hops in X-Forwarded-For and rate-limit per real client instead of one shared bucket.
      // Caddy only keeps an incoming X-Forwarded-For from trusted (private) peers, so clients cannot spoof it.
      trustedProxies: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "::1/128", "fc00::/7"],
    },
  },
  plugins: [
    magicLink({
      disableSignUp: true,
      expiresIn: 15 * 60,
      sendMagicLink: async ({ email, url }) => {
        await adapters().messaging.sendEmail(magicLinkEmail(email, url));
      },
    }),
    admin({ impersonationSessionDuration: 60 * 60 }),
    nextCookies(), // must stay last
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
