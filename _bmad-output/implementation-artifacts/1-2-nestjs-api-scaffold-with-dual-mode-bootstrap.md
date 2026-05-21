# Story 1.2: NestJS API scaffold with dual-mode bootstrap

Status: done

## Story

As an engineer,
I want `apps/api` to boot either as an HTTP API or as a BullMQ worker from the same codebase,
so that production runs one artifact in two process modes.

## Acceptance Criteria

1. `apps/api` starts under `API_MODE=api` exposing a placeholder `GET /healthz` returning `{status:"ok"}`.
2. Same process starts under `API_MODE=worker` initializing NestJS without binding an HTTP port, logging "worker-mode ready".
3. NestJS `CommonModule` provides a shared pino logger and configuration module wired from environment variables.
4. Mode is selected through a single bootstrap entrypoint; no code duplication between modes.

## Tasks / Subtasks

- [x] Task covering AC #1 — HealthModule + HealthController at `apps/api/src/health/`; `@Controller('healthz')` GET handler returns `{status:'ok'}`; verified via integration test `API_MODE=api boots HTTP server and GET /healthz returns {status:"ok"}`.
- [x] Task covering AC #2 — `main.ts` invokes `NestFactory.createApplicationContext` (no HTTP) when `API_MODE=worker`, logs `worker-mode ready` via the shared pino logger, installs SIGTERM/SIGINT graceful shutdown; verified via integration test `API_MODE=worker boots without HTTP and logs "worker-mode ready"` (sentinel port held open to prove no bind attempt).
- [x] Task covering AC #3 — `CommonModule` (`@Global()`) imports `ConfigModule.forRoot({ isGlobal:true, validate:validateEnv })` and `LoggerModule.forRootAsync({ inject:[ConfigService], useFactory })` from `nestjs-pino`; `env.config.ts` defines a Zod schema for `API_MODE/NODE_ENV/PORT/LOG_LEVEL` with structured error on invalid env; pretty-print transport applied outside production.
- [x] Task covering AC #4 — Single `main.ts` entrypoint, single `AppModule` graph, mode-conditional only at the `NestFactory.create` vs `createApplicationContext` line; structure test `main.ts switches on API_MODE without duplicating Nest factory calls per branch` enforces ≤2 factory calls.

### Review Findings

- [x] [Review][Patch] Hoist `enableShutdownHooks()` to shared post-branch path; both API and worker modes now get identical SIGTERM/SIGINT/SIGHUP handling via Nest's built-in shutdown (which also fires `onModuleDestroy` so `LoggerModule` flushes pino on close) [apps/api/src/main.ts]
- [x] [Review][Patch] Custom signal handlers removed in favor of `enableShutdownHooks()` — Nest's built-in handler catches `close()` failures, exits non-zero on failure, and re-emits the signal so repeated SIGTERM force-exits via the default OS handler [apps/api/src/main.ts]
- [x] [Review][Patch] Single env validation path: `validateEnv(process.env)` at top of `bootstrap()`, branches on `env.API_MODE`. Hand-rolled `readApiMode` deleted. `ConfigModule.forRoot({ validate: validateEnv })` uses the same Zod schema — @nestjs/config replaces its internal config with the validator's return so `ConfigService.get('PORT')` is a number [apps/api/src/main.ts, apps/api/src/common/common.module.ts]
- [x] [Review][Patch] `pino-pretty` moved to `devDependencies`; pretty-mode condition tightened from `!== 'production'` to explicit `'development' | 'test'` allow-list — accidental misconfig fails loudly with module-not-found rather than silently shipping pretty logs to prod [apps/api/package.json, apps/api/src/common/common.module.ts]
- [x] [Review][Patch] `flushLogs()` now called after `useLogger` in both branches — buffered Nest init logs are emitted instead of being swallowed [apps/api/src/main.ts]
- [x] [Review][Patch] Worker test replaced tautological EADDRINUSE check with a positive ECONNREFUSED probe: `fetch('http://127.0.0.1:${PORT}/healthz')` must fail, proving the worker serves no HTTP. API test also asserts `Content-Type: application/json` header [tests/scaffold/api-bootstrap.test.mjs]
- [x] [Review][Patch] Structure test now asserts BOTH `NestFactory.create(` AND `NestFactory.createApplicationContext(` appear (regex allows the `<NestExpressApplication>` generic), plus a new test asserting `validateEnv` is called exactly once and `enableShutdownHooks` is called in main.ts. Env-config regex tightened to require `z.enum(API_MODES)` and the quoted `'api'` / `'worker'` literals [tests/scaffold/api-structure.test.mjs]
- [x] [Review][Patch] Unknown-mode test now asserts `/banana/` (the actual bad value) appears in stderr in addition to `/API_MODE/` [tests/scaffold/api-bootstrap.test.mjs]
- [x] [Review][Patch] `waitForLine` rewritten to take the child process (not just the stream) and reject on `exit`/`error` events; settles cleanup via a `settled` flag to avoid double-firing. Hangs collapse to fast failures with full captured stdout [tests/scaffold/api-bootstrap.test.mjs]
- [x] [Review][Patch] `test:scaffold` now runs `pnpm --filter @fcm/api build` first; spawn-based tests use `{ skip: !distExists, ... }` so a missing dist surfaces a single clean failure instead of cascading ENOENT noise [package.json, tests/scaffold/api-bootstrap.test.mjs]
- [x] [Review][Patch] API log line changed from `api-mode ready — listening on :${port}` (em-dash, string interpolation in the message) to `api-mode ready: listening on port ${env.PORT}` (plain ASCII, port from the validated env) [apps/api/src/main.ts]
- [x] [Review][Defer] Add `HOST` env var so bind interface is explicit (currently `0.0.0.0` implicit) — deferred to when first runbook needs loopback-only binding
- [x] [Review][Defer] Global exception filter / global ValidationPipe — deferred to a later API-hardening story; out of scaffold scope
- [x] [Review][Defer] Test that asserts `@Global()` on CommonModule via injection from a feature module — deferred; defense-in-depth only
- [x] [Review][Defer] Windows-specific SIGTERM semantics in the worker — deferred; production runs Linux containers
- [x] [Review][Defer] pino transport worker error handler — deferred; low-probability path
- [x] [Review][Defer] `getFreePort` TOCTOU race in tests — deferred; acceptable for scaffold suite

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).
- **Story-specific:** The dual-mode bootstrap is the AD-1 architectural decision (one codebase, two process modes). Future BullMQ consumers (E4.1+) register inside `AppModule` and run under `API_MODE=worker`; HTTP controllers (E6.1+) register inside `AppModule` and run under `API_MODE=api`. The single `main.ts` MUST remain the only entrypoint — adding a second bootstrap path would re-introduce code duplication that this story exists to prevent.
- **NodeNext + ESM + decorators:** `apps/api` runs as ESM (`"type":"module"`); TS internal imports use `.js` extensions per NodeNext rules; `experimentalDecorators` and `emitDecoratorMetadata` are required for NestJS DI and are enabled in `apps/api/tsconfig.json` only (not the base, so non-decorator workspaces stay clean).
- **`exactOptionalPropertyTypes: true`** is enforced repo-wide. The `nestjs-pino` `pinoHttp.transport` field cannot be assigned `undefined`; instead, build the options object conditionally (see `common.module.ts` factory). Future Nest config factories must follow the same conditional-key pattern.

### Dependencies

- E1.1

### References

- Arch §3.2 (Why Modular Monolith — same codebase, two process modes)
- Arch §3.4 (Component Interaction Diagram — fcm-api modular monolith composition)
- AD-1 (one build, two deployments, no code duplication)
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Amelia — bmad-dev-story skill)

### Debug Log References

- RED phase: `node --test tests/scaffold/api-structure.test.mjs` confirmed 5 of 6 structure assertions fail (only the `main.ts exists` check passed against the pre-existing placeholder `src/index.ts` — N/A; actual main.ts didn't exist yet).
- GREEN phase build attempt 1 failed: `exactOptionalPropertyTypes: true` rejected `transport: <object> | undefined` in `LoggerModule.forRootAsync` factory. Resolved by building the `pinoHttp` options object conditionally rather than passing `transport: undefined`.
- GREEN phase test run: 10/10 new scaffold tests pass; full scaffold suite 22/22 pass (no regressions to story 1-1's 12 tests).
- Manual smoke test confirmed: worker mode logs `worker-mode ready` and binds no port; API mode listens on configured port and `curl /healthz` returns `{"status":"ok"}`.
- Repo-wide `pnpm run typecheck` clean across all 4 workspaces.

### Completion Notes List

- **AC1 — `GET /healthz` returns `{status:"ok"}`:** `HealthController` declared with `@Controller('healthz')` + `@Get()` returning the literal-typed `{ status: 'ok' }`. `HealthModule` registered in `AppModule`. Integration test spawns the compiled `dist/main.js` under `API_MODE=api` on a free port, waits for the bootstrap log line, and asserts the JSON response body — proving the route is wired end-to-end through Express, not just unit-mocked.
- **AC2 — worker mode without HTTP:** Worker branch uses `NestFactory.createApplicationContext(AppModule)` which initializes the full DI graph (CommonModule + future workers) without instantiating a `NestExpressApplication`. The integration test holds a sentinel port open *before* spawning the worker; the worker is given that same port via `PORT` env, and the test asserts `EADDRINUSE` is never observed in stderr — proving the worker never even attempted to bind. SIGTERM/SIGINT handlers call `ctx.close()` for graceful shutdown.
- **AC3 — shared logger + config:** `CommonModule` is `@Global()` so every downstream module gets `ConfigService` and `Logger` injection without re-importing. Zod-based env validation runs at boot via `ConfigModule.forRoot({ validate: validateEnv })`, with structured multi-issue error output if any var fails the schema. `LoggerModule.forRootAsync` injects `ConfigService` and reads `LOG_LEVEL` and `NODE_ENV` from validated config. `pino-pretty` transport applied outside production for human-readable dev/test logs; production gets raw JSON for log aggregators.
- **AC4 — single entrypoint, no duplication:** `main.ts` reads `API_MODE` once, branches into two Nest factory calls (`create` for HTTP, `createApplicationContext` for worker), then both branches share the rest of the boot sequence (logger swap, shutdown handlers). Structure test asserts at most 2 factory calls in `main.ts`. `AppModule` is imported once and used in both branches — no parallel module graphs.
- **Cross-cutting:** `apps/api/tsconfig.json` now sets `experimentalDecorators`, `emitDecoratorMetadata`, and `types: ["node"]`. Repo-wide strict mode (including `exactOptionalPropertyTypes`) preserved; the conditional-key pattern in `CommonModule.forRootAsync` is the canonical solution future Nest config factories will follow when they hit the same constraint.
- **Test infra:** Tests use Node's built-in `node:test`, no Jest/Vitest added at the api workspace level. Bootstrap integration tests spawn the compiled `dist/main.js` — they require `pnpm --filter @fcm/api build` to have run first. The repo-root `test:scaffold` script can be extended to run the build first in a future story if CI flake from forgetting the build becomes an issue (deferred — not in this story's scope).

### File List

- `apps/api/package.json` (modified — NestJS deps, scripts, devDeps)
- `apps/api/tsconfig.json` (modified — decorators + node types)
- `apps/api/src/main.ts` (new — single dual-mode bootstrap)
- `apps/api/src/app.module.ts` (new)
- `apps/api/src/common/common.module.ts` (new)
- `apps/api/src/common/env.config.ts` (new — Zod env schema)
- `apps/api/src/health/health.module.ts` (new)
- `apps/api/src/health/health.controller.ts` (new)
- `tests/scaffold/api-structure.test.mjs` (new — 6 file-system assertions)
- `tests/scaffold/api-bootstrap.test.mjs` (new — 4 spawn-and-verify integration tests)
- `pnpm-lock.yaml` (regenerated by `pnpm install` after new deps)

## Change Log

- 2026-05-21 — Story 1-2 implemented. Single-entrypoint dual-mode NestJS bootstrap per AD-1: `API_MODE=api` boots `NestExpressApplication` + `GET /healthz`; `API_MODE=worker` boots `ApplicationContext` (no HTTP) and logs "worker-mode ready". Shared `CommonModule` provides pino logger (via `nestjs-pino`) and Zod-validated env config (via `@nestjs/config`). 10 new scaffold tests added (6 structure + 4 bootstrap integration); full scaffold suite 22/22 green, no regressions. Repo-wide typecheck clean. Status: backlog → in-progress → review.
- 2026-05-21 — Code review pass (Blind Hunter / Edge Case Hunter / Acceptance Auditor) surfaced 11 patch findings and 6 defers. All 11 patches applied: (1) single env-validation path via `validateEnv` + ConfigModule sharing the same Zod schema; (2) `enableShutdownHooks` hoisted to shared path so both modes get graceful shutdown + pino flush; (3) `pino-pretty` moved to devDependencies with stricter `dev|test` allow-list; (4) `flushLogs()` after `useLogger` in both branches; (5) worker test now positively asserts ECONNREFUSED on `/healthz`; (6) API test asserts `Content-Type: application/json`; (7) structure tests now require BOTH factory calls, exactly-one `validateEnv` call, and `enableShutdownHooks` presence; (8) unknown-mode test asserts the offending value appears in stderr; (9) `waitForLine` rejects on early child exit; (10) `test:scaffold` runs the build first and spawn tests skip cleanly when `dist` is missing; (11) ASCII log separator and validated-env port reference. Full scaffold suite now 24/24 green, repo-wide typecheck clean, manual smoke verified production-like worker emits raw JSON logs (no `pino-pretty` required). 6 items deferred to `_bmad-output/implementation-artifacts/deferred-work.md`. Status remains: review.
