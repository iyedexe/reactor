# CLAUDE.md — instructions for AI agents working on AvisBoost

Read `HANDOFF.md` (state), `TODO.md` (what's next) and `docs/WORKFLOW.md` (how) before changing anything.

## Commands

```bash
pnpm install
pnpm db:deploy && pnpm db:generate     # apply migrations, generate Prisma client
pnpm db:seed                           # WIPES the dev database, loads demo data
pnpm dev                               # web :3000, worker health :3001
pnpm check                             # typecheck + lint + unit + integration (needs Postgres, avisboost_test DB)
pnpm test:e2e                          # Playwright, needs a running seeded app (E2E_BASE_URL)
```

## Non-negotiable rules

- **Tenancy:** never import `@prisma/client` or the generated client outside `packages/db`. Use
  `requireTenant().db` in web code, `forTenant({ organizationId })` in services. `@avis/db/system` only where
  ESLint allows it. New tenant tables follow the checklist in `docs/WORKFLOW.md` §3.
- **Google policy:** never gate or filter the Google review option by sentiment; every customer gets the same
  review request; no incentives; replies never offer compensation for changing a review and never reveal
  customer personal data; no automated or bulk submission of removal requests.
- **GDPR:** check consent and the suppression list at send time; every message has an opt-out.
- **External APIs** go through `packages/adapters` with a mock; config in `packages/core/src/env.ts` and
  `.env.example`.
- **Next.js 16** differs from older versions: read `apps/web/AGENTS.md` and the bundled docs first.
- Before Claude/Anthropic API code, load the `claude-api` skill; before charts, the `dataviz` skill.
- UI copy in French first; every string in both `apps/web/messages/fr.json` and `en.json`.
- Keep `TODO.md` up to date at the end of each phase; summarize what was built and what must be configured.
- Run `pnpm check` before committing. Don't commit `.env`.
