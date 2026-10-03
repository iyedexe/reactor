# AvisBoost

Google review growth platform for local businesses in France (restaurants, salons, garages, clinics):
NFC/QR review stands, review requests by e-mail/SMS, AI replies to reviews, policy-violation flagging,
and a client dashboard that shows how much the business has grown since joining.

Self-hosted with Docker Compose: **web** (Next.js) · **worker** (pg-boss jobs) · **postgres** · **caddy**.

> Status: **phase 1 of 9** (foundation). See [Roadmap](#roadmap).

---

## Architecture

```
           ┌─────────────── caddy (HTTPS, or :80 behind a Cloudflare Tunnel) ───────────────┐
           │  everything ──► web (Next.js standalone)     /r/* ──► links (phase 3)         │
           └───────────────────────────────────────────────────────────────────────────────┘
  web ──┐                                       worker (pg-boss: syncs, replies, sends, reports)
        ├──► postgres  (app tables + "pgboss" schema for jobs) ◄──┘
        └── migrate (one-shot `prisma migrate deploy`, runs before web/worker start)
```

| Path | What it is |
|---|---|
| `apps/web` | Next.js 16 App Router UI + API routes, Better Auth, next-intl (fr default, en ready), shadcn/ui |
| `apps/worker` | Background jobs and schedules (pg-boss), `/healthz`, bundled with esbuild |
| `packages/db` | Prisma schema + migrations, **tenant-scoped data-access layer** (`forTenant`) |
| `packages/core` | Pure logic and helpers: env config, JSON logger, normalization, templates, dates |
| `packages/adapters` | Every external API behind an interface: Google Business Profile, Places, Claude, messaging, storage — each with a mock |
| `packages/services` | Domain services shared by web and worker: review sync, rollups, baseline, job queue |
| `packages/seed` | Demo data: 3 businesses, 12 months of history |

### Tenancy

Every tenant-owned table has an `organizationId` column. Application code never touches Prisma directly:

- `forTenant({ organizationId })` returns a client that **ANDs the tenant id into every read/update/delete**,
  rejects creates for another tenant, rejects foreign keys that point at another tenant's rows, rejects nested
  relation writes, blocks raw SQL, and cannot reach global tables (users, sessions…).
- Pages and actions get it from `requireTenant()`, which derives the organization from the signed-in user's
  memberships (a cookie only selects among them).
- Cross-tenant code (worker fan-out, auth, admin panel) uses `@avis/db/system` — ESLint only allows that import in
  those places, and forbids `@prisma/client` everywhere outside `packages/db`.
- `packages/db/src/tenant.int.test.ts` runs read/update/delete/create attacks for **every** tenant model against a
  second tenant, and fails if a new model is added without being classified.

### External APIs (adapters)

Each adapter has a mock so the platform runs end to end without any account. Switch with `*_MODE` variables:

| Adapter | Mock | Real | Variable |
|---|---|---|---|
| Google Business Profile (reviews, replies) | `mock_gbp_*` tables filled by the seed | GBP API v4 (needs Google approval) | `GOOGLE_MODE` |
| Google Places (competitors) | `mock_place` table | Places API (New) | `PLACES_MODE` |
| Claude (replies, classification) | deterministic French templates | phase 4 | `LLM_MODE` |
| E-mail + SMS | logs to stdout | Brevo / Twilio (phase 5) | `MESSAGING_MODE` |
| Stripe | phase 7 | phase 7 | `STRIPE_MODE` |
| File storage | local volume | S3/MinIO (phase 8) | `STORAGE_DRIVER` |

---

## Local development

Requirements: Node 22+, pnpm 10 (`corepack enable`), Docker.

```bash
cp .env.example .env              # then set APP_SECRET (openssl rand -base64 48)
docker compose -f docker-compose.dev.yml up -d    # Postgres (+ avisboost_test database)
pnpm install
pnpm db:deploy && pnpm db:generate
pnpm db:seed                      # wipes the DB and loads the demo businesses
pnpm dev                          # web on :3000, worker health on :3001
```

Demo logins (password `demo-avisboost`):

| Business | Owner | Staff |
|---|---|---|
| Le Petit Zinc (bistro, Lyon, 2 locations) | sophie@lepetitzinc.demo | karim@lepetitzinc.demo |
| Atelier Margaux Coiffure (salon, Bordeaux) | margaux@ateliermargaux.demo | ines@ateliermargaux.demo |
| Garage Dumont Auto (garage, Nantes) | patrick@garagedumont.demo | julien@garagedumont.demo |

Platform admin: `admin@avisboost.local` / `admin-avisboost` (or `ADMIN_EMAIL` / `ADMIN_PASSWORD` when seeding).

Magic links and other e-mails are printed in the dev server log while `MESSAGING_MODE=console`.

### Tests and checks

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration     # needs Postgres; uses TEST_DATABASE_URL (default …/avisboost_test)
```

---

## Production (quick start)

A full guide for a fresh Debian host (DNS, HTTPS, Cloudflare Tunnel vs public IP, backups, updates, Jenkins)
arrives with phase 9. The short version:

```bash
cp .env.example .env    # set APP_URL, APP_SECRET, POSTGRES_PASSWORD, SITE_ADDRESS
docker compose build
docker compose up -d                                   # public VPS: Caddy gets certificates for SITE_ADDRESS
# or: SITE_ADDRESS=:80 + CLOUDFLARE_TUNNEL_TOKEN, then
docker compose --profile tunnel up -d                  # home server behind a Cloudflare Tunnel

# optional demo data (wipes the database!)
docker compose run --rm -e SEED_FORCE=1 worker node dist/seed.mjs
```

- Migrations run automatically in the one-shot `migrate` container before `web` and `worker` start.
- Health: `GET /api/health` (web) and `GET :3001/healthz` (worker); Docker restarts unhealthy/crashed containers.
- Logs are JSON on stdout (`docker compose logs -f worker`).

---

## Roadmap

1. **Foundation** ✅ Docker, data model, auth, tenancy, mock Google adapter, seed data
2. Client dashboard
3. Smart links (`/r/{code}`) and landing page
4. Automatic replies (Claude)
5. E-mail/SMS review requests
6. Alerts and policy-violation flagging
7. Stripe billing and admin panel
8. Monthly PDF report
9. Backups, Jenkins pipeline, deployment docs

> The Python files at the repository root (`reactor/`, `setup.py`, `requirements.txt`, `test_*.py`) and the current
> `Jenkinsfile` belong to an older project and are not used by AvisBoost; the Jenkinsfile is replaced in phase 9.
