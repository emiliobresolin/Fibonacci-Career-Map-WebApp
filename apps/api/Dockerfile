# syntax=docker/dockerfile:1.7
# FCM API + Worker — single multi-stage image. The same image is deployed twice
# in Kubernetes: once with API_MODE=api (HTTP server + GET /healthz), once with
# API_MODE=worker (BullMQ consumer + cron schedulers — wired in EPIC-4). Shared
# entrypoint per AD-1.

# ─── Stage 1: deps (full install, all workspaces involved in API) ─────────────
FROM node:20.18-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /workspace

# Copy workspace manifest first for better layer caching. apps/web is included
# because pnpm-workspace.yaml globs apps/*; pnpm install still ignores it via
# the --filter set.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/domain-contracts/package.json packages/domain-contracts/
COPY packages/scoring-core/package.json packages/scoring-core/
COPY apps/web/package.json apps/web/

# Full install (devDeps included) so `tsc` is available in the build stage.
# --ignore-scripts skips postinstall (prisma generate) because schema.prisma
# isn't copied yet; we run it explicitly in the build stage.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts \
      --filter '@fcm/api...' \
      --filter '@fcm/domain-contracts...' \
      --filter '@fcm/scoring-core...'

# ─── Stage 2: build (compile TS, run prisma generate against full deps) ────────
FROM deps AS build
WORKDIR /workspace

COPY tsconfig.base.json ./
COPY packages/domain-contracts/ packages/domain-contracts/
COPY packages/scoring-core/ packages/scoring-core/
COPY apps/api/ apps/api/

# Generate Prisma client now that schema.prisma is present.
RUN pnpm --filter @fcm/api exec prisma generate

# Compile TypeScript -> dist/.
RUN pnpm --filter @fcm/api build

# ─── Stage 3: prune (production-only install + regenerate Prisma client) ──────
# Re-resolve to a smaller node_modules tree containing only runtime deps.
# `prisma` is in `dependencies` (not devDependencies) so it survives the prune
# and the `postinstall: prisma generate` hook fires against the schema again,
# repopulating .prisma/client. This is the canonical Docker + pnpm + Prisma
# pattern; do not change without verifying `docker run --rm <image> node -e
# "require('@prisma/client')"` succeeds.
FROM deps AS prune
WORKDIR /workspace
COPY --from=build /workspace/tsconfig.base.json ./
COPY --from=build /workspace/packages/ packages/
COPY --from=build /workspace/apps/api/ apps/api/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod \
      --filter '@fcm/api...' \
      --filter '@fcm/domain-contracts...' \
      --filter '@fcm/scoring-core...'

# ─── Stage 4: runtime ─────────────────────────────────────────────────────────
FROM node:20.18-alpine AS runtime
RUN apk add --no-cache tini openssl
WORKDIR /app

# Non-root user — Kubernetes runAsNonRoot enforces this anyway, but we set it
# in the image so the container is also safe outside the cluster.
RUN addgroup -S fcm && adduser -S -G fcm fcm

# Copy production node_modules + workspace packages + Prisma client + dist.
COPY --from=prune --chown=fcm:fcm /workspace/node_modules /app/node_modules
COPY --from=prune --chown=fcm:fcm /workspace/packages /app/packages
COPY --from=prune --chown=fcm:fcm /workspace/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build --chown=fcm:fcm /workspace/apps/api/dist /app/apps/api/dist
COPY --from=build --chown=fcm:fcm /workspace/apps/api/package.json /app/apps/api/package.json
COPY --from=build --chown=fcm:fcm /workspace/apps/api/prisma /app/apps/api/prisma

USER fcm

# Mode is selected at runtime via API_MODE env (api | worker). Production
# deployments set this in the Kubernetes Deployment spec — see infra/k8s/{api,worker}/.
# PORT is intentionally NOT set here so the K8s Deployment / app config owns it
# as a single source of truth.
ENV API_MODE=api \
    NODE_ENV=production \
    LOG_LEVEL=info

EXPOSE 3000

# tini reaps zombie children and forwards signals so graceful shutdown
# (enableShutdownHooks in main.ts) actually fires on SIGTERM from K8s.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/apps/api/dist/main.js"]
