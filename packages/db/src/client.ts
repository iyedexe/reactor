import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

/**
 * Raw, unscoped Prisma client. Internal to @avis/db: other packages must use
 * `forTenant()` (from "@avis/db") or the explicitly audited `system` API (from "@avis/db/system").
 * ESLint enforces this boundary.
 */
export type RawPrisma = PrismaClient;

const globalForPrisma = globalThis as unknown as { __avisPrisma?: PrismaClient };

export function createPrisma(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
  return new PrismaClient({ adapter });
}

export function prisma(): PrismaClient {
  globalForPrisma.__avisPrisma ??= createPrisma();
  return globalForPrisma.__avisPrisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (globalForPrisma.__avisPrisma) {
    await globalForPrisma.__avisPrisma.$disconnect();
    globalForPrisma.__avisPrisma = undefined;
  }
}
