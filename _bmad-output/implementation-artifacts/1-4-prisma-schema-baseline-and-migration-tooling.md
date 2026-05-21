# Story 1.4: Prisma schema baseline and migration tooling

Status: done

## Story

As an engineer,
I want a Prisma baseline wired into `apps/api` and a migration pipeline integrated into CI,
so that later stories add tables safely.

## Acceptance Criteria

1. `apps/api/prisma/schema.prisma` exists with provider `postgresql` and a single placeholder model (`_MigrationProbe`) to validate migration flow.
2. `prisma migrate dev` runs locally against a dev Postgres; `prisma migrate deploy` runs as a dedicated CI job against staging.
3. Generated Prisma client is imported from a single exported module inside the API.
4. Database URL is loaded from secrets (never committed); `.env.example` documents the variable.

## Tasks / Subtasks

- [x] Task covering AC #1 — `apps/api/prisma/schema.prisma` declares `provider = "postgresql"`, `url = env("DATABASE_URL")`, and one model `MigrationProbe` mapped to the table `_MigrationProbe`. The table is dropped by EPIC-2's identity migration when it lands.
- [x] Task covering AC #2 — `pnpm --filter @fcm/api prisma:migrate:dev` runs `prisma migrate dev` locally (developers must pass `-- --name <slug>` to avoid the interactive prompt); `prisma:migrate:deploy` is the CI invocation. Initial migration `20260521000000_init/migration.sql` is hand-written for this story only because the migration pipeline ships before any Postgres exists; subsequent schema changes MUST go through `prisma migrate dev`. CI wiring (the actual pre-deploy workflow file) lands with Story 1-6 (Kubernetes / CI).
- [x] Task covering AC #3 — `apps/api/src/prisma/` is the single exported module: `prisma.module.ts` (`@Global()` + provides/exports `PrismaService`), `prisma.service.ts` (extends `PrismaClient`, injects the validated `ConfigService<Env, true>` and passes `DATABASE_URL` to PrismaClient explicitly), and `index.ts` barrel. Imports from `@prisma/client` are confined to `prisma.service.ts` by convention (a future ESLint `no-restricted-imports` rule will enforce this — deferred).
- [x] Task covering AC #4 — `DATABASE_URL` is added to the Zod env schema in `apps/api/src/common/env.config.ts` and promoted to required in production via `superRefine` (NODE_ENV=production without DATABASE_URL fails at boot, not at first query). `apps/api/.env.example` documents the variable with placeholder values like `<user>:<password>` so accidental copy-paste cannot ship a real-looking credential. `.gitignore` at the repo root already excludes `.env` / `.env.*` (asserted by scaffold test).

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).
- **Story-specific:** The init migration is the ONLY hand-written migration this codebase will ever ship. Every future schema change must go through `prisma migrate dev --name <slug>` against a local Postgres so Prisma generates the SQL. If a future change needs raw SQL Prisma cannot model (RLS policies, partition management, append-only triggers — see Arch §6.5), use `prisma migrate dev --create-only --name <slug>` and then hand-edit the generated migration file before applying.
- **`postinstall` runs `prisma generate`** so `pnpm install` produces working types in `node_modules/.prisma/client`. If the install ever fails because `schema.prisma` is missing (e.g., a future Docker layer that copies `package.json` before `prisma/`), guard the postinstall: `node -e "..." || true`.
- **`pgcrypto` extension intentionally NOT used.** UUIDs are application-generated via Prisma's `@default(uuid())`, so the migration role does not need `CREATE EXTENSION` privilege — managed Postgres providers (RDS, Cloud SQL, Supabase) commonly gate this behind a superuser-only grant.
- **PrismaService passes `DATABASE_URL` explicitly to `super({ datasources: { db: { url } } })`** rather than letting PrismaClient read `process.env.DATABASE_URL` directly. This keeps the validated env in `env.config.ts` as the single source of truth — what `validateEnv` accepted is exactly what PrismaClient uses.
- **PrismaService does NOT call `$connect()` in `onModuleInit`.** Prisma's lazy-connect-on-first-query is desirable: the API boots in test mode and in `prisma generate`-only contexts where there is no live DB. Health probes (Story 1-8) will exercise the connection.
- **Connection-pool tuning (`connection_limit`, `pool_timeout`)** is deferred to production-prep but documented in `.env.example` as a recommended query-param to set when API + worker pods scale horizontally.

### Dependencies

- E1.2

### References

- Arch §6.5 (Prisma as ORM + migration tool; supports raw SQL for RLS / partitions / triggers)
- Arch §6.2 (data model — `audit_events` append-only, `score_snapshots` partitioned, `employees`, etc., land in later epics)
- Arch §12.4 (CI/CD — migrations run as a pre-deploy job, not on app boot, to avoid concurrent-migration races)
- Arch §12.6 (secrets from cloud secret manager — never committed)
- AD-8 (Prisma over TypeORM)
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Amelia — bmad-dev-story skill)

### Debug Log References

- RED phase: 11 prisma-structure assertions all failed against the empty `apps/api/prisma/` directory.
- GREEN phase attempt 1: API spawn tests failed because PrismaService construction reaches `new PrismaClient()`, which requires `DATABASE_URL` at the URL parser level. Resolved by setting `DATABASE_URL='postgresql://stub:stub@stub.invalid:5432/stub'` in the spawn env (stub.invalid is non-routable so no accidental dev-DB connection happens if Prisma ever does try to connect).
- GREEN phase attempt 2: `prisma generate` initially failed because the old generated client cached in `node_modules/.prisma/client` had stale types from the previous (`postgresqlExtensions` preview) schema. Resolved by re-running `pnpm --filter @fcm/api exec prisma generate` after the schema simplification.
- Code review pass: 14 + 15 + 7 findings across three reviewers. 8 unique patches applied (production-required DATABASE_URL via Zod `superRefine`, PrismaService consuming validated ConfigService, schema dropped pgcrypto/`CREATE EXTENSION` in favor of client-side UUIDs, `.env.example` placeholder hardening, test stub uses non-routable `stub.invalid` host, `--name` requirement documented in Dev Notes, schema/migration drift policy documented, table-name convention noted).

### Completion Notes List

- **AC1:** `schema.prisma` declares the postgresql provider, reads `url = env("DATABASE_URL")`, and exposes exactly one model (`MigrationProbe` → table `_MigrationProbe`). Scaffold test asserts both the provider declaration and the `@@map("_MigrationProbe")` line.
- **AC2:** `prisma:migrate:dev` and `prisma:migrate:deploy` scripts wired in `apps/api/package.json`. The CI workflow file that calls `prisma:migrate:deploy` lands in Story 1-6 (Kubernetes / CI manifests) — Story 1-4's scope is the migration-tooling surface, not the pipeline orchestration. Init migration SQL is hand-written for this story only; future migrations use `prisma migrate dev`.
- **AC3:** `apps/api/src/prisma/` is the single exported module (verified by `index.ts` barrel + scaffold test checking `extends PrismaClient` + `OnModuleDestroy` + `@Global()` + `providers/exports`). PrismaService consumes the validated env via `ConfigService<Env, true>` and passes the URL explicitly to PrismaClient.
- **AC4:** `.env.example` documents `DATABASE_URL` with `<user>:<password>` placeholders (no plausible-looking credentials), `.env` files are ignored via the existing root `.gitignore`, and `env.config.ts` requires `DATABASE_URL` in production via Zod `superRefine` so a misconfigured prod pod fails at boot.
- **Workspace integration:** `postinstall: prisma generate` ensures the type-safe client is available immediately after `pnpm install`. Repo-wide typecheck clean (all 4 workspaces).

### File List

- `apps/api/package.json` (modified — `prisma` + `@prisma/client` 5.22.0 deps, postinstall + 4 prisma scripts)
- `apps/api/prisma/schema.prisma` (new)
- `apps/api/prisma/migrations/migration_lock.toml` (new)
- `apps/api/prisma/migrations/20260521000000_init/migration.sql` (new — hand-written init)
- `apps/api/.env.example` (new)
- `apps/api/src/prisma/prisma.module.ts` (new)
- `apps/api/src/prisma/prisma.service.ts` (new)
- `apps/api/src/prisma/index.ts` (new — barrel)
- `apps/api/src/app.module.ts` (modified — imports PrismaModule)
- `apps/api/src/common/env.config.ts` (modified — DATABASE_URL + superRefine for prod)
- `tests/scaffold/prisma-structure.test.mjs` (new — 11 assertions)
- `tests/scaffold/api-bootstrap.test.mjs` (modified — spawn env includes stub DATABASE_URL)
- `pnpm-lock.yaml` (regenerated)

### Review Findings

- [x] [Review][Patch] `DATABASE_URL` promoted to required when `NODE_ENV=production` via Zod `superRefine` — misconfigured prod fails at boot, not at first query [apps/api/src/common/env.config.ts]
- [x] [Review][Patch] `PrismaService` now receives the validated `ConfigService<Env, true>` via DI and passes `DATABASE_URL` explicitly to `super({ datasources: { db: { url } } })` — single source of truth for the URL [apps/api/src/prisma/prisma.service.ts]
- [x] [Review][Patch] Schema dropped `previewFeatures = ["postgresqlExtensions"]` and `extensions = [pgcrypto]`; UUIDs are application-generated via `@default(uuid())` so the DB role doesn't need `CREATE EXTENSION` privilege [apps/api/prisma/schema.prisma]
- [x] [Review][Patch] Migration SQL dropped the `CREATE EXTENSION IF NOT EXISTS pgcrypto` line and the `DEFAULT gen_random_uuid()` on id; ID is supplied by Prisma client, eliminating the managed-Postgres permission risk [apps/api/prisma/migrations/20260521000000_init/migration.sql]
- [x] [Review][Patch] `.env.example` placeholders changed from `fcm:fcm` (plausible-looking) to `<user>:<password>` (unmistakable placeholder); added a `connection_limit/pool_timeout` doc-note for production tuning [apps/api/.env.example]
- [x] [Review][Patch] Test spawn `DATABASE_URL` now points at `stub.invalid:5432` (non-routable host) so a regression that adds `$connect()` on boot can't accidentally connect to a developer's local dev Postgres [tests/scaffold/api-bootstrap.test.mjs]
- [x] [Review][Patch] Schema/migration drift policy documented in Dev Notes: future schema changes MUST go through `prisma migrate dev --name <slug>`; only the init migration is hand-written and only because no local Postgres exists yet
- [x] [Review][Patch] `--name` requirement for `prisma:migrate:dev` documented in Dev Notes (avoids interactive prompt in non-TTY contexts)
- [x] [Review][Defer] CI workflow file invoking `prisma:migrate:deploy` — deferred to Story 1-6 (Kubernetes / CI manifests). Story 1-4 owns the script surface; Story 1-6 owns the orchestration that calls it
- [x] [Review][Defer] ESLint `no-restricted-imports` rule banning direct `@prisma/client` imports — deferred to a dedicated linting story
- [x] [Review][Defer] `connection_limit` / `pool_timeout` query params on production DATABASE_URL — documented in `.env.example` but not enforced; revisit during production prep
- [x] [Review][Defer] Shadow database for `prisma migrate dev` against managed Postgres — deferred; first developer using managed dev Postgres adds `SHADOW_DATABASE_URL`
- [x] [Review][Defer] `PrismaService` unit tests (lifecycle warn path + onModuleDestroy) — deferred; first real DB-touching domain module (EPIC-2) lands with integration tests that cover the service
- [x] [Review][Defer] Prisma 6 upgrade — Prisma 5.22.0 is the stable 5.x release; defer until 6.x has been GA for a quarter and the migration cost is justified
- [x] [Review][Defer] DATABASE_URL redaction in pino error logs — pino's redaction paths land in EPIC-1.7 (observability baseline)
- [x] [Review][Defer] Pre-merge bot for migration timestamp ordering — process concern, addressed via CODEOWNERS + branch policy when CI lands
- [x] [Review][Dismiss] `_MigrationProbe` table-name leading-underscore concern — kept verbatim because AC1 quotes the exact name. The table is dropped by EPIC-2's identity migration before any Prisma-internal `_*` collision could occur; not worth deviating from the spec

## Change Log

- 2026-05-21 — Story 1-4 implemented. `apps/api/prisma/schema.prisma` with `_MigrationProbe` placeholder model; hand-written init migration (single exception — future schema changes go through `prisma migrate dev`); single-exported `PrismaModule`/`PrismaService` at `apps/api/src/prisma/`; `DATABASE_URL` added to Zod env schema with production-required `superRefine`; `.env.example` documents the variable with unmistakable placeholders. 11 new scaffold tests; full scaffold suite 55/55 green; repo-wide typecheck clean.
- 2026-05-21 — Code review pass (Blind / Edge / Auditor) surfaced 14+15+7 findings. 8 unique patches applied: production-required DATABASE_URL, PrismaService consuming validated ConfigService, schema dropped pgcrypto via client-side UUIDs, migration SQL simplified to match, `.env.example` placeholder hardening, test spawn uses non-routable `stub.invalid` host, drift policy documented, `--name` requirement documented. 8 items deferred (CI workflow → Story 1-6, ESLint rule, connection pool tuning, shadow DB, Prisma 6, log redaction, merge-time migration ordering, unit tests for PrismaService). 1 dismissed (table-name kept verbatim per AC1). Full scaffold suite 55/55 green, typecheck clean. Status: review → done.
