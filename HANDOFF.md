# AvisBoost — Project handoff

_Last updated: 2026-10-11 · End of phase 1 of 9_

## 1. Where things are

| | |
|---|---|
| Repository | `github.com/iyedexe/reactor` |
| Branch | `avisboost` (phase 1). `master` still holds the old Python project and is untouched. |
| Status | Phase 1 (foundation) complete and verified. Phases 2–9 not started. |
| Plan & checklists | [`TODO.md`](TODO.md) |
| How to work on it | [`docs/WORKFLOW.md`](docs/WORKFLOW.md) |
| Setup / run / deploy | [`README.md`](README.md) |
| Agent instructions | [`CLAUDE.md`](CLAUDE.md) |
| CI | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

No pull request has been opened yet. Merge `avisboost` into `master` (or open a PR) when you are happy with phase 1.

## 2. What works today

- Full stack runs with Docker Compose: `postgres` → one-shot `migrate` → `web` + `worker` → `caddy`.
  Verified end to end in containers: migrations, health checks, seeding, login through Caddy, admin
  impersonation, JSON logs, idempotent re-migration.
- Login with password or magic link (links are printed in the logs while `MESSAGING_MODE=console`).
- Owner/staff see only their business; platform admin sees the client list and can "Accéder au compte"
  (impersonation, written to the audit log) and come back.
- Worker syncs reviews from the mock Google every 15 min (full scan nightly), tags new reviews (language,
  sentiment, topics, policy category), recomputes daily stats, captures the onboarding baseline.
- Demo data for 3 businesses with 12 months of history (logins in the README).
- The dashboard page is a **phase-1 placeholder** (rating, review count, locations). The real dashboard is phase 2.

## 3. Verification at handoff

| Check | Result |
|---|---|
| `pnpm typecheck` (7 packages) | ✅ |
| `pnpm lint` (incl. tenancy import boundaries) | ✅ |
| Unit tests | ✅ 16 |
| Integration tests (tenant isolation on every model, review sync) | ✅ 177 |
| Mutation check: disabling tenant scoping makes isolation tests fail | ✅ 96 failures, as expected |
| e2e Playwright smoke tests against a production build | ✅ 5 |
| Docker images build (web, worker, migrate) + compose stack healthy | ✅ (in the build sandbox) |
| GitHub Actions CI | ⚠️ written and simulated locally, **not yet run on GitHub** — check the first run |

## 4. Key decisions (and why)

| Decision | Why |
|---|---|
| pnpm monorepo, TypeScript 6, Next.js 16, Prisma 7.10, pg-boss 12, Better Auth 1.7 | Latest stable at build time. TS 7 (Go port) and Prisma 8 (RC) were too new. |
| Tenancy = Prisma client extension (`forTenant`) + ESLint boundaries + isolation tests | One choke point for every query; tests prove it per table. Postgres RLS could be added later as defense in depth. |
| Better Auth **without** its organization plugin | Memberships/invitations live in our tables behind the tenant layer: one source of truth. |
| Public sign-up disabled | Clients are created by the platform admin (Stripe self-serve is a phase-7 question). |
| Separate `links` service for `/r/` (phase 3) | Stands keep working when the web app is redeployed or down. |
| Mocks for every external API, selected by `*_MODE` | Runs end to end before Google approves API access. |
| Worker bundled with esbuild + `pnpm deploy --prod` | Small runtime image; build fails if a runtime dependency is missing. |
| Login rate limiting trusts private proxy ranges | Correct per-client limits behind Caddy and Cloudflare Tunnel (without it, all users would share one bucket). |

## 5. Things to know (gotchas)

- **Legacy files** (`reactor/`, `setup.py`, `requirements.txt`, `test_*.py`, Windows `Jenkinsfile`) are still at
  the root of the branch: deleting them was blocked by the build session's permissions. Delete them when you
  confirm; the Jenkinsfile is rewritten in phase 9.
- **Seeding wipes the database.** It refuses to run with `NODE_ENV=production` unless `SEED_FORCE=1`.
- **`APP_SECRET`** signs sessions and keys the opt-out hashes; changing it logs everyone out and invalidates
  stored suppression hashes. Generate once, back it up with your database backups.
- **`APP_URL` must match the URL users type** (Better Auth rejects other origins).
- Next.js 16 conventions differ from older docs: `src/proxy.ts` (not middleware), async `cookies()/headers()`.
  The bundled docs are in `apps/web/node_modules/next/dist/docs/`.
- `apps/web/AGENTS.md`/`CLAUDE.md` are maintained by `next dev`; keep them committed.
- Google live adapters are untested against the real APIs (no credentials yet).

## 6. What the owner needs to provide

| Needed for | Item |
|---|---|
| Any deployment | Domain name(s), server (Debian), `APP_SECRET`, `POSTGRES_PASSWORD` |
| Home server | Cloudflare account + tunnel token |
| Phase 2 (competitors live) | Google Places API key (Places API (New) enabled) |
| Real reviews | Google Business Profile API approval + OAuth client + refresh token of the managing account |
| Phase 4 | Anthropic API key |
| Phase 5 | Brevo account (API key, verified sender domain, SMS sender name) |
| Phase 7 | Stripe account, products/prices, plan limits, setup fee, grace period |
| Phase 9 | NAS path for backups, Jenkins Linux agent with Docker, SSH access to the server |

Open product questions are listed at the end of `TODO.md`.

## 7. Next step

Start **phase 2 — client dashboard** on a new branch from `avisboost` (see `TODO.md` for the checklist).
All data it needs is already in the schema and in the seed (`location_daily_stat`, `baseline_snapshot`,
`link_event`, `review_request`, `competitor_snapshot`).
