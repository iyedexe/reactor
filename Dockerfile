# syntax=docker/dockerfile:1.7
# Multi-target build for the AvisBoost platform.
#   docker build --target web     -t avisboost/web .
#   docker build --target worker  -t avisboost/worker .
#   docker build --target migrate -t avisboost/migrate .
# All runtime images run as the unprivileged "node" user.

ARG NODE_VERSION=22.22.0

# ── base ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

# ── deps: install the whole workspace from the lockfile (cached layer) ──────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/adapters/package.json packages/adapters/
COPY packages/services/package.json packages/services/
COPY packages/seed/package.json packages/seed/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ── build ───────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @avis/db generate
# Build-time placeholders only; real values come from the runtime environment.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    APP_SECRET=build-time-placeholder-secret-not-used-at-runtime \
    pnpm --filter @avis/web build
RUN pnpm --filter @avis/worker build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @avis/worker deploy --prod --legacy /out/worker \
 && cp -r apps/worker/dist /out/worker/dist
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @avis/db deploy --legacy /out/db \
 && cp -r packages/db/prisma packages/db/prisma.config.ts /out/db/

# ── web: Next.js standalone server ──────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
RUN mkdir -p /data/storage && chown node:node /data/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# ── worker: background jobs and schedules (pg-boss) ─────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS worker
ENV NODE_ENV=production WORKER_HEALTH_PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /out/worker ./
RUN mkdir -p /data/storage && chown node:node /data/storage
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

# ── migrate: one-shot `prisma migrate deploy` ───────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS migrate
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/db ./
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
