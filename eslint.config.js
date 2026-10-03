import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * The important rules here are the import boundaries that make tenancy hard to bypass:
 *  - only packages/db may touch the Prisma client;
 *  - "@avis/db/system" (unscoped, cross-tenant) is only allowed in back-office code paths;
 *  - "@avis/db/testing" only in tests and the seed.
 */
const PRISMA = {
  group: ["@prisma/client", "@prisma/client/*", "**/generated/prisma", "**/generated/prisma/*", "@avis/db/client"],
  message: "Use forTenant() from @avis/db (or @avis/db/system where explicitly allowed).",
};
const SYSTEM = {
  group: ["@avis/db/system"],
  message: "Unscoped DB access is only allowed in worker, links, auth/session, admin and services code. Use requireTenant().db.",
};
const TESTING = { group: ["@avis/db/testing"], message: "Test helpers are for tests and the seed only." };

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/generated/**", "**/next-env.d.ts", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-imports": ["error", { patterns: [PRISMA, SYSTEM, TESTING] }],
    },
  },
  {
    files: [
      "apps/worker/**",
      "apps/links/**",
      "apps/web/src/server/**",
      "apps/web/src/app/admin/**",
      "apps/web/src/app/api/**",
      "packages/services/src/**",
      "packages/adapters/src/**",
    ],
    rules: { "no-restricted-imports": ["error", { patterns: [PRISMA, TESTING] }] },
  },
  {
    files: ["**/*.test.ts", "packages/seed/**", "test/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [PRISMA] }] },
  },
  { files: ["packages/db/**"], rules: { "no-restricted-imports": "off" } },
);
