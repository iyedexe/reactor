# AvisBoost — TODO

Status legend: `[x]` done · `[ ]` to do · `(?)` needs a decision from the product owner.
Phases follow the agreed build order. After each phase: summary + "what you need to configure".

**Product scope:** a reputation and local-visibility (notoriété) service built on **Google reviews** and the
**Google Business Profile listing**. **Out of scope: client websites** (no site builder or hosting).

---

## Phase 1 — Foundation ✅ (branch `avisboost`)

- [x] pnpm monorepo (`apps/web`, `apps/worker`, `packages/{db,core,adapters,services,seed}`)
- [x] Prisma 7 schema for the whole product, single `init` migration
- [x] Tenant-scoped data access (`forTenant`) + isolation tests on every tenant model + ESLint boundaries
- [x] Better Auth: email/password, magic links, platform admin, audited impersonation, sign-up disabled
- [x] Login rate limiting keyed on the real client IP behind Caddy / Cloudflare Tunnel
- [x] Adapters with mocks: Google Business Profile, Places, LLM, messaging (console), storage (local)
- [x] Review sync (incremental + nightly full, deletion detection, external replies), daily rollups, baseline
- [x] Worker: pg-boss queues + schedules, `/healthz`, graceful shutdown, mock review generator
- [x] Seed: 3 businesses, 12 months of consistent history
- [x] Dockerfile (web/worker/migrate, non-root), prod + dev compose, Caddy, `.env.example`
- [x] CI workflow (GitHub Actions): typecheck, lint, unit, integration, e2e, image builds
- [x] Playwright e2e smoke tests (login, tenant separation, admin, impersonation)

## Phase 2 — Client dashboard ✅

- [x] Location switcher (one location / all locations aggregated) kept in URL (`?lieu=`)
- [x] Period picker (30 j, 90 j, 12 mois, tout) — custom date range not done
- [x] Metric functions in `packages/services/src/metrics/*` reading `location_daily_stat` (+ unit tests):
  - [x] current rating, total reviews, reviews this month — each with trend vs previous period
  - [x] rating over time, review count over time (Recharts)
  - [x] velocity (reviews/week): 12 weeks before joining vs since joining
  - [x] "Impact depuis votre arrivée": baseline vs now (rating, count, velocity, response rate)
  - [x] response rate and average response time
  - [x] star distribution; sentiment and topics (service, prix, attente…)
  - [x] funnels: stand scans → Google clicks → estimated reviews; messages sent → clicked → estimated reviews
  - [x] performance by stand and by campaign
  - [x] competitor benchmark (3–5 nearest, tracked over time) + weekly `competitors.refresh` job (Places)
- [x] Reviews list: filters (stars, answered/unanswered, date, location), reply drafts and statuses
- [x] Private feedback inbox (read/archive)
- [x] "Synchroniser maintenant" button (enqueue `reviews.sync`)
- [x] Empty states: KPIs show "–", impact hidden until the baseline exists
- [x] Charts use the validated dataviz palette (light + dark tokens); app has no dark-mode toggle yet
- [x] e2e: dashboard renders with seeded data for each demo business

## Phase 3 — Smart links & landing page ✅

- [x] `apps/links` service (plain Node + `pg`): `/r/{code}`, `/r/{code}/google`, `/r/{code}/message`, `/m/{token}`, `/healthz`
- [x] In-memory cache of stands + branding, invalidated instantly via Postgres `LISTEN/NOTIFY` triggers, serves stale data if the DB is down
- [x] Batched async event logging (`link_event`), device/OS parsing, salted daily visitor hash, link-preview bots ignored
- [x] Landing page: business branding, **two equal options** (same style and size, tested), no rating gate, no cookies, no JS
- [x] Private feedback form: validation, honeypot, per-visitor rate limit; "Leave a Google review" still offered after sending
- [x] E-mail/SMS links (`/m/{token}`) mark the request as clicked once
- [x] Inactive/unassigned/terminated stands: neutral page, or `LINKS_INACTIVE_REDIRECT_URL`
- [x] Admin: stand stock (create batch), assign/reassign/deactivate/back to stock (audited), printable QR sheet (SVG, A4), CSV export of NFC URLs (`?s=n` / `?s=q`)
- [x] Client page "Supports": stats, rename, QR download
- [x] Caddy routes `/r/* /m/*` → links; optional `LINKS_SITE_ADDRESS` short domain; Docker target + compose service
- [x] Load test: ~2,350 req/s, p95 36 ms, p99 56 ms at 50 concurrent (bundled build, dev machine)
- [ ] Uptime monitor setup documented (phase 9)
- [ ] Location logo on the landing page (initials for now; needs logo upload, phase 8 storage)

## Phase 4 — Automatic replies

- [ ] Read the `claude-api` skill; Anthropic adapter (`LLM_MODE=anthropic`), model ids via env, prompt caching
- [ ] Reply settings UI per location (tone, signature, always/never mention, auto-publish rules)
- [ ] Pipeline in `processNewReview`: draft → guardrails → auto-publish (4–5★) or approval queue (1–3★)
- [ ] Guardrails: no compensation offers / no "change your review", no personal data, never-mention list → force approval
- [ ] Reply in reviewer's language
- [ ] Approval queue + editor; publish via adapter; `reply_revision` history (who, when)
- [ ] Respect `serviceState` (no publishing when suspended)
- [ ] Tests: reply rules, guardrails, idempotent publish, mock adapter

## Phase 5 — E-mail/SMS review requests ✅

- [x] Contacts: manual add (explicit consent + evidence), CSV import (`;`/`,`, French dates, per-row or declared consent, line report), booking-tool webhook (bearer token stored hashed)
- [x] Consent log (append-only) + suppression list (keyed hashes, survives GDPR erasure), both re-checked **at send time**
- [x] Opt-out in every message: e-mail footer link + `List-Unsubscribe` / one-click POST (RFC 8058); SMS "STOP : link"; `/u/{token}` page; SMS "STOP" replies and hard bounces/complaints via Brevo webhook
- [x] Templates: per-organization editor with live checks (required link, no incentive, no sentiment gating, unknown variables), preview, SMS length/segments
- [x] Scheduler: delay after visit, quiet hours (SMS 9–20 h, e-mail 8–21 h, Mon–Sat, no French public holidays), DST-safe; 1 request + 1 reminder max (DB unique + claim-before-send); no reminder after a click
- [x] Same message for every customer; channel choice is SMS-if-consented else e-mail, nothing else
- [x] Brevo adapter (`/v3/smtp/email`, `/v3/transactionalSMS/send`), Twilio SMS adapter, per-channel provider routing
- [x] Tracking: sent, delivered, clicked, attributed review (name match / time window), shown on the dashboard
- [x] Worker: dispatch every 5 min, attribution hourly
- [x] Tests: quiet hours/holidays/DST, template rules, consent/opt-out, max one reminder, attribution, CSV, webhooks, Brevo payloads, e2e
- [ ] Verify Brevo webhook payloads (especially SMS replies) against your Brevo account and adjust `parseBrevoEvent` if needed
- [ ] Brevo sender domain authentication (SPF/DKIM/DMARC) — configuration on your side
- [ ] Twilio delivery status callbacks (not wired; Twilio is send-only for now)

## Phase 6 — Alerts & policy flagging

- [ ] Instant alert (e-mail/SMS per member prefs) for any review ≤ 3★
- [ ] Classification UI: category, confidence, explanation
- [ ] Violation reports for likely violations only: pre-filled reason, button to Google's official removal page, status tracking
- [ ] Verify `GOOGLE_REVIEW_REMOVAL_URL` in `packages/core/src/google.ts` against current Google docs
- [ ] Non-violating negative reviews: "strong public reply" suggestion instead of flagging; no bulk/automated submission
- [ ] Private feedback alert to owner

## Phase 7 — Billing & admin

- [ ] Plans and limits (?) — Essentiel / Pro prices, setup fee, SMS quota, locations, competitors
- [ ] Stripe adapter + Checkout (trial 1 month + setup fee) + Customer Portal + webhook (idempotent via `stripe_event`)
- [ ] Cancellation: SUSPENDED (campaigns, replies, syncs stop) → TERMINATED after `BILLING_GRACE_DAYS` (stands deactivated)
- [ ] Admin: client health (rating trend, unanswered reviews, campaign activity, billing), create client + invite owner, stands
- [ ] Team settings: invite staff (own `invitation` table + magic link), roles owner/staff
- [ ] Self-serve signup flow (?) (currently sign-up is disabled; admin creates clients)

## Phase 8 — Monthly PDF report

- [ ] Report template reusing dashboard components; Playwright (Chromium) in the worker image
- [ ] Storage adapter: S3/MinIO driver; files in `stored_file`
- [ ] Monthly schedule (1st, 07:00 Paris), per org and per location, e-mailed to owners with `monthlyReport` pref
- [ ] Download from the dashboard

## Phase 9 — Ops

- [ ] `infra/backup/backup.sh`: nightly `pg_dump` (custom format) + storage volume, 30-day rotation, path configurable (NAS)
- [ ] Documented, tested restore procedure
- [ ] New Jenkinsfile (Linux agent with Docker): build → test → push/save images → deploy over SSH → migrate → health check
- [ ] README: fresh Debian host, DNS, HTTPS, Cloudflare Tunnel vs public IP, backups, updates, rollback
- [ ] Uptime Kuma (optional compose profile) monitoring `/r/` health, web, worker
- [ ] Remove legacy Python files and old Jenkinsfile (needs owner confirmation)

## Phases 10–12 — Local SEO / notoriété module (no website)

Google ranks local results on **relevance**, **distance** and **prominence**. Distance can't be changed;
these phases work on relevance (listing content) and prominence (reviews, activity, consistency).
Never promise "#1": results depend on where the person searches from.

### Phase 10 — Google listing audit & optimisation
- [ ] Read the full listing through the GBP adapter (mock first): categories, services/prices, hours (incl. special
      hours/holidays), description, attributes, photos (count, freshness), booking link
- [ ] Completeness score per location with prioritized recommendations
      (e.g. "add category 'Barbier'", "5 photos older than 6 months", "no special hours for 25 December")
- [ ] One-click apply of simple fixes via the API (owner approves; audit log of every change)
- [ ] Guardrails: no keywords stuffed into the business name, no fake addresses (Google guidelines)
- [ ] Score history in the dashboard and monthly report

### Phase 11 — Google posts (listing activity)
- [ ] AI-drafted posts (offer, news, photo of the week) in the business's tone, owner approval required
- [ ] Scheduling (e.g. one per week) and publishing via the GBP adapter; history and statuses
- [ ] Reminder when no post or photo was published for N days

### Phase 12 — Local rank tracking & visibility report
- [ ] Per location: tracked searches (e.g. "barbier Lyon 2", "coiffeur homme Bellecour"), 3–10 per plan
- [ ] Rank adapter with mock; real provider (?) — Places Text Search approximation vs a paid local-SERP API
      (Google has no official Maps-position API; cost per check must be priced into the plan)
- [ ] Grid of points around the business (e.g. 5×5 over 2 km), weekly checks, heat map + trend
- [ ] Comparison with the tracked competitors (reuses phase 2 competitors)
- [ ] Citation consistency checklist: same name/address/phone on PagesJaunes, Apple Plans, Bing, Facebook,
      booking tools (manual tracker, no automated submissions)
- [ ] "Visibilité" section in the dashboard and monthly PDF

### Offer structure (?)
- **Essentiel** — stands + review requests + AI replies + alerts + dashboard
- **Visibilité** — Essentiel + listing audit/optimisation + Google posts + rank tracking

---

## Tech debt & known limitations

- [ ] Legacy files at the repo root (`reactor/`, `setup.py`, `requirements.txt`, `test_*.py`, old Windows `Jenkinsfile`) — deletion was blocked in the build session; remove when confirmed.
- [ ] shadcn/ui components were written by hand (registry unreachable from the build sandbox). `components.json` is present; `npx shadcn add <component>` works on a normal machine.
- [ ] `LiveGoogleBusinessAdapter` and `LivePlacesAdapter` are written against the documented APIs but **never called for real** (no credentials yet). Test them as soon as access is granted.
- [ ] Better Auth rate-limit store is in memory: fine for a single `web` container; switch to `storage: "database"` (needs a `rateLimit` table) if `web` is ever scaled out.
- [ ] Session `cookieCache` (5 min) means a banned/removed user keeps access up to 5 min.
- [ ] Daily rollups exclude reviews later removed from Google (consistent with Google's current view, but history changes slightly after removals).
- [ ] Seed is deterministic, but its dates are relative to "now": re-seed before a sales demo.
- [ ] `proxy.ts` matcher already lists `/avis` and `/parametres` (future routes).
- [ ] Worker image ~530 MB (Node slim base + Prisma); could shrink with a distroless base later.

## Open questions for the product owner

1. Plan prices/limits, setup fee amount, trial length confirmation (1 month).
2. Grace period after cancellation (default 30 days) and what a deactivated stand shows.
3. Domains: app (e.g. `app.avisboost.fr`) and short links (e.g. `avb.fr`).
4. Jenkins: Linux agent with Docker available? Registry, or build on the server?
5. French public holidays as "quiet days" for SMS/e-mail (recommended)?
6. Rank tracking provider: free approximation (Places API) or a paid local-SERP API? Searches per plan?
7. Pricing of the "Visibilité" tier vs "Essentiel".
