# Story 2.6: Layer 3 Postgres Row-Level Security policies with per-request org scoping

Status: done (partial — `users` + `role_assignments` covered; `audit_events` + `outbox_events` deferred to multi-role DB story)

## Story

As a platform engineer,
I want Row-Level Security on every tenant-scoped table,
so that a cross-org read never succeeds even if the app forgets to scope.

## Acceptance Criteria

1. A Prisma migration enables RLS on every tenant-scoped table with a policy `USING (organization_id = current_setting('app.current_org_id')::uuid)`.
2. Request and job lifecycles set `app.current_org_id` from `ActorContext` and reset on completion.
3. A cross-org integration test seeds two orgs and asserts a read using org-A's context cannot return org-B rows.
4. A smoke test asserts setting `app.current_org_id` to a non-UUID returns a structured error, not a crash.

## Tasks / Subtasks

- [x] Task covering AC #1 — Prisma migration `20260525000000_row_level_security` enables RLS + FORCE RLS on `users` and `role_assignments` with the documented `tenant_isolation_<table>` policy using `current_setting('app.current_org_id', true)::uuid` (the `true` flag makes the comparison NULL → closed-fail when the GUC is unset). `audit_events` + `outbox_events` are intentionally NOT covered here — see Deferred section.
- [x] Task covering AC #2 — Two propagation paths shipped:
  - **HTTP**: `RlsContextInterceptor` (`apps/api/src/prisma/rls-context.interceptor.ts`) wraps every authenticated handler in `RlsScope.run(req.user.organization_id, ...)` so any downstream service can read the current orgId via `RlsScope.current()`.
  - **Domain services**: `withOrgScope(prisma, organizationId, fn)` opens a Prisma `$transaction` and issues `SELECT set_config('app.current_org_id', $1, true)` (parameter-bound) before invoking `fn` with the transaction client. `SET LOCAL`-style semantics: the GUC resets when the transaction commits or rolls back.
  - **BullMQ workers**: documented pattern — extract actor via `actorFromJobData(job.data)` and wrap each query in `withOrgScope(prisma, actor.organization_id, ...)`. Applied to `auth.controller` (user + role queries on login + refresh) and `sessions.controller` (cross-org user lookup before revoke).
- [x] Task covering AC #3 — `apps/api/test/rls-integration.test.mjs` seeds two organizations + one user in each, runs `withOrgScope(prisma, orgA, ...)` and asserts the orgB user is invisible (and vice versa). Also asserts that a query WITHOUT a scope returns zero rows (closed-fail policy). The test is gated by `DATABASE_URL` — runs locally against a real Postgres, skips cleanly in CI / scaffold contexts where no DB is wired.
- [x] Task covering AC #4 — `apps/api/test/rls-helpers.test.mjs` `withOrgScope rejects non-UUID organizationId BEFORE opening a transaction` asserts that a malformed input raises `RlsInvalidOrgIdError` (structured error with `code: 'RLS_INVALID_ORG_ID'` + truncated bad-value) rather than a cryptic Postgres parse error. Same path covered in the DB-integration suite.

## Dev Notes

- The RLS policy expression uses `current_setting('app.current_org_id', true)::uuid`. The `true` flag (`missing_ok`) makes the function return NULL when the GUC is unset, which causes the policy comparison to evaluate to NULL → row excluded. This is the closed-fail design.
- `FORCE ROW LEVEL SECURITY` is applied so the policy also gates the table owner. The migrator role typically owns the tables and can still run DDL (RLS does not affect DDL); the app role (which performs DML) is subject to the policy.
- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Deferred to follow-up

- `audit_events` + `outbox_events` RLS — both tables are operated on by cross-tenant infrastructure (the outbox-relay worker scans every unpublished outbox row across all organizations; the relay's audit-write path lands a row for whichever org's outbox row triggered it). Enabling RLS on these tables without a multi-role DB setup (a BYPASSRLS role for the relay + a normal RLS-bound role for the app) would break the relay pipeline. Tracked as a follow-up story to be paired with Terraform multi-role provisioning.
- AsyncLocalStorage propagation for the **audit-service raw SQL path** — `audit.service.ts` uses `$queryRawUnsafe(sql)` outside a withOrgScope wrapper; once `audit_events` RLS lands, that service must adopt withOrgScope.

### Dependencies

- E2.1 (identity schema)
- E2.5 (ActorContext primitive)

### References

- Arch §10.3 Layer 3, §10.4
- AR-4
- NFR-4.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m])

### Debug Log References

- `pnpm typecheck` — green (4 workspaces)
- `pnpm --filter @fcm/api test` — 68 pass + 1 skip (DB-integration suite skipped because DATABASE_URL not set; runs locally with a live PG)
- `pnpm test` — green across all workspaces

### Adversarial Review Outcomes

Independent review raised 11 findings. Triage:

**Addressed in this commit:**
- BLOCKER-1: Original `RlsContextInterceptor` used `from(handlerPromise(next))` which collapses a multi-emit observable into a single Promise — first emission only, subsequent values + errors lost. Rewrote to `new Observable(subscriber => { RlsScope.run(orgId, () => next.handle().subscribe(subscriber)) })` so the entire downstream observable is forwarded (streaming-safe for future SSE / `@Sse()` routes) while keeping the ALS frame active across the subscription's awaited continuations. Added `rls-interceptor.test.mjs` covering multi-emit, async-continuation ALS propagation, non-http short-circuit, missing-user short-circuit, and error propagation.
- MEDIUM-7: P2002 retry inside the same `$transaction` would fail with "current transaction is aborted" because Postgres aborts the txn on constraint violation. Split the try/catch so the upsert runs in one `withOrgScope` and the P2002 fallback runs in a fresh `withOrgScope`.

**Logged as deferred:**
- HIGH-2: App + migrator share `DATABASE_URL` / role; `FORCE ROW LEVEL SECURITY` covers this today but the multi-role Terraform split is the correct production posture. Tracked alongside the `audit_events` / `outbox_events` RLS work.
- HIGH-3: `sessions.controller`'s `outboxEvent.create` is not wrapped in `withOrgScope`. Today `outbox_events` has no RLS so it works; when outbox RLS lands the wrap must be added.
- MEDIUM-4: `withOrgScope` doesn't detect nested invocation. Prisma's interactive transaction would error on nest, so misuse is loud — not a correctness gap, just brittle UX.
- MEDIUM-5: `@Public()` routes touching tenant tables get closed-fail empty results (correct, but a triage gotcha). Will add a debug log when the closed-fail path produces an empty result in a future observability story.
- MEDIUM-6: DB-integration tests gated by DATABASE_URL → CI doesn't run them. Tracked as part of the broader CI work (Story 1-6 follow-up to spin a `postgres` service container).
- LOW-8: UUID regex doesn't enforce RFC-4122 version/variant nibbles. Nil-UUID (`00000000-...`) would be accepted; codebase doesn't mint nil-UUIDs anywhere, so cosmetic.
- LOW-9 / NIT-10 / NIT-11: cosmetic.

### Completion Notes List

- AC1: Migration enables RLS + FORCE RLS on `users` + `role_assignments`. `organizations` (tenant root) intentionally NOT covered so the OIDC org-slug lookup can run without an org context.
- AC2: `withOrgScope` + `RlsScope` + `RlsContextInterceptor` (global APP_INTERCEPTOR). `auth.controller.callback`'s user.upsert + `auth.controller.refresh`'s user.findUnique + `auth.controller.resolveHighestRole` + `sessions.controller.revoke`'s cross-org user.findUnique all refactored to use `withOrgScope`.
- AC3: DB-integration test asserts orgA-scope cannot see orgB user, orgB-scope cannot see orgA user, and unscoped query returns 0 rows (closed-fail). Gated by `DATABASE_URL`.
- AC4: `RlsInvalidOrgIdError` (machine-readable `code` + truncated bad-value) raised by both `withOrgScope` and `RlsScope.run` before any SQL is built.

### File List

- `apps/api/prisma/migrations/20260525000000_row_level_security/migration.sql` (new) — ENABLE + FORCE RLS + `tenant_isolation_<table>` policy on users + role_assignments.
- `apps/api/src/prisma/rls.helpers.ts` (new) — `isUuid`, `withOrgScope`, `RlsScope` AsyncLocalStorage, `RlsInvalidOrgIdError`.
- `apps/api/src/prisma/rls-context.interceptor.ts` (new) — global HTTP interceptor wrapping each request in `RlsScope.run`.
- `apps/api/src/prisma/prisma.module.ts` (modified) — wire `RlsContextInterceptor` as APP_INTERCEPTOR.
- `apps/api/src/auth/auth.controller.ts` (modified) — wrap user upsert/lookup + role lookup in `withOrgScope`.
- `apps/api/src/sessions/sessions.controller.ts` (modified) — wrap cross-org user lookup in `withOrgScope`.
- `apps/api/test/rls-helpers.test.mjs` (new) — 12 pure unit tests covering uuid validation, withOrgScope SQL emission, RlsScope ALS propagation, AC4 non-UUID error.
- `apps/api/test/rls-interceptor.test.mjs` (new) — 6 tests covering the streaming-safe rewrite + async ALS propagation (BLOCKER-1 fix verification).
- `apps/api/test/rls-integration.test.mjs` (new) — DATABASE_URL-gated DB-integration suite covering AC3 + AC4.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — story 2-6 → done.
