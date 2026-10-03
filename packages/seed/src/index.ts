import { disconnectPrisma, systemDb } from "@avis/db/system";
import { resetDatabase } from "@avis/db/testing";
import { config } from "dotenv";
import { ADMIN_DEFAULT_EMAIL, ADMIN_DEFAULT_PASSWORD, BUSINESSES, DEMO_PASSWORD } from "./businesses.ts";
import { seedAll } from "./generate.ts";
import { Rng } from "./rng.ts";

config({ path: ["../../.env", ".env"], quiet: true });

/**
 * Demo seed: wipes the database and creates 3 businesses with 12 months of history.
 * Refuses to run in production unless SEED_FORCE=1 (it deletes everything).
 */
async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "1") {
    throw new Error("Refusing to seed a production database (set SEED_FORCE=1 to override: this wipes all data).");
  }
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) throw new Error("APP_SECRET must be set (32+ chars) before seeding");

  const started = Date.now();
  const db = systemDb();
  console.log("Resetting database…");
  await resetDatabase(db);
  console.log("Seeding demo data…");
  await seedAll({ db, rng: new Rng(20261003), now: new Date(), secret, log: (m) => console.log(m) });

  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.\n`);
  console.log("Logins:");
  console.log(`  platform admin  ${process.env.ADMIN_EMAIL ?? ADMIN_DEFAULT_EMAIL} / ${process.env.ADMIN_PASSWORD ? "(ADMIN_PASSWORD)" : ADMIN_DEFAULT_PASSWORD}`);
  for (const b of BUSINESSES) console.log(`  ${b.name.padEnd(26)} ${b.owner.email} (owner), ${b.staff.email} (staff) / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
