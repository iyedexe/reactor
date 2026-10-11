import { defineConfig } from "vitest/config";

const testDbUrl = process.env.TEST_DATABASE_URL ?? "postgresql://avis:avis@localhost:5432/avisboost_test";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
          exclude: ["**/*.int.test.ts", "**/node_modules/**"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["packages/*/src/**/*.int.test.ts", "apps/*/src/**/*.int.test.ts", "test/**/*.int.test.ts"],
          environment: "node",
          globalSetup: ["test/global-setup.ts"],
          env: { DATABASE_URL: testDbUrl, GOOGLE_MODE: "mock", APP_SECRET: "test-secret-test-secret-test-secret", APP_URL: "https://app.avisboost.test", LINKS_URL: "https://avb.test" },
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
