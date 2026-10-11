# Development workflow

How to work on AvisBoost day to day. Read `README.md` first for setup.

## 1. Branches and phases

- Product work happens in **phases** (see `TODO.md`). One phase = one branch = one pull request.
- Phase 1 lives on `avisboost`. Next phases: `phase-2-dashboard`, `phase-3-smart-links`, … branched from the
  latest merged state.
- Each phase ends with: green CI, an updated `TODO.md` (tick boxes), and a short summary of
  "what was built / what you need to configure" in the PR description.
- Commit messages: imperative, explain *why* when it isn't obvious.

## 2. Daily loop

```bash
docker compose -f docker-compose.dev.yml up -d     # Postgres
pnpm dev                                           # web :3000 + worker (health :3001)
pnpm check                                         # typecheck + lint + all vitest tests
pnpm test:e2e                                      # needs a running, seeded app (see README)
```

Before pushing, always run `pnpm check`. CI (`.github/workflows/ci.yml`) runs the same steps plus e2e and the
three Docker image builds.

## 3. Database changes

1. Edit `packages/db/prisma/schema.prisma`.
2. `pnpm db:migrate --name <what_changed>` (creates `prisma/migrations/<timestamp>_<name>/` and applies it).
3. `pnpm db:generate` if your editor doesn't pick up the new types.
4. **New table?** Follow the checklist below.
5. Commit the migration folder. Never edit a migration that has been deployed; add a new one.

In production, migrations run automatically in the one-shot `migrate` container before `web`/`worker` start.

### Checklist: adding a tenant-owned table

- [ ] Add an `organizationId String` column (even on child tables) and an index that starts with it.
- [ ] Register the model in `TENANT_MODELS` (`packages/db/src/tenant.ts`), or in `GLOBAL_MODELS` if it is
      genuinely global. The registry test fails until you do.
- [ ] If it has foreign keys to tenant tables, add them to `FOREIGN_KEYS` in the same file.
- [ ] Add one row to `createTenantFixture()` (`packages/db/src/testing.ts`). The isolation tests then
      automatically attack the new table from a second tenant.
- [ ] Access it only through `requireTenant().db` (web) or `forTenant({ organizationId })` (services/worker).

## 4. Data access rules (enforced by ESLint)

| Where | Use |
|---|---|
| Pages, server actions, components | `const { db } = await requireTenant()` |
| Services / worker handlers for one client | `forTenant({ organizationId })` |
| Cross-tenant work (fan-out, admin panel, auth, links service) | `systemDb()` from `@avis/db/system`, and `audit()` for actions done on behalf of a person |
| Anything else | not allowed: `@prisma/client` is only imported inside `packages/db` |

Raw SQL is not available in tenant clients. If you need it (e.g. heavy aggregates), write a function in
`packages/services` that takes the `organizationId`/`locationId` explicitly and test it.

## 5. External APIs

Every third-party API sits behind an interface in `packages/adapters` with a mock, selected by a `*_MODE`
variable in `createAdapters()`.

To add or replace a provider:
1. Implement the interface (`google/types.ts`, `places/types.ts`, `llm/types.ts`, `messaging/types.ts`, `storage/types.ts`).
2. Wire it in `packages/adapters/src/index.ts` and document its variables in `packages/core/src/env.ts`
   **and** `.env.example`.
3. Tests use the mock, or swap in fakes with `setAdapters()`.

Before writing Claude/Anthropic code (phase 4), load the `claude-api` skill.

## 6. Background jobs

- Job names and payload types: `packages/services/src/queue.ts` (`JOBS`, `JobData`).
- Handlers and schedules: `apps/worker/src/index.ts`. Schedules are declared on every boot (idempotent),
  in Europe/Paris time.
- The web app enqueues with `enqueue(JOBS.x, data)`; it never runs jobs itself.
- Handlers must be idempotent (pg-boss retries failures with backoff). Use `singletonKey` to avoid duplicates.
- Every external dependency of the worker bundle must be a direct dependency of `apps/worker` —
  `node build.mjs` fails with the list of missing packages otherwise.

## 7. UI and i18n

- Next.js 16: read `apps/web/AGENTS.md` and the bundled docs in `node_modules/next/dist/docs/` before using an
  API you haven't used in this version (`proxy.ts` replaces middleware; request APIs are async).
- Routes and copy are French. Every user-facing string goes in `apps/web/messages/fr.json` **and** `en.json`.
- Components follow shadcn/ui conventions in `apps/web/src/components/ui`.
- Load the `dataviz` skill before building charts.

## 8. Testing pyramid

| Layer | Where | Runs against |
|---|---|---|
| Unit (pure logic) | `packages/*/src/**/*.test.ts` | nothing |
| Integration | `**/*.int.test.ts` | Postgres `avisboost_test` (migrated automatically) |
| End to end | `e2e/*.spec.ts` (Playwright) | a running, seeded app (`E2E_BASE_URL`) |

Required by the spec and never to be skipped: tenant isolation, review sync, reply rules, consent/opt-out,
metric calculations.

## 9. Release (until phase 9 automates it)

```bash
git pull && docker compose build && docker compose up -d   # migrate runs first, then web/worker restart
docker compose ps && curl -fsS https://<domain>/api/health
```
