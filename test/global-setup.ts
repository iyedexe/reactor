import { execSync } from "node:child_process";

/** Applies migrations to the throwaway test database before the integration suite. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://avis:avis@localhost:5432/avisboost_test";
  execSync("pnpm --filter @avis/db exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
