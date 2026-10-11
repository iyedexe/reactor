import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests against a running, seeded app.
 *   pnpm db:seed && pnpm dev            (or the production stack)
 *   E2E_BASE_URL=http://localhost:3000 pnpm test:e2e
 * PLAYWRIGHT_CHROMIUM_PATH can point at a preinstalled Chromium.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
      },
    },
  ],
});
