# Story 6.2a: Employees and employee_assignments tables

Status: done

## Story

As an engineer,
I want the core `employees` and `employee_assignments` tables,
so that every downstream domain has the entity its FKs reference.

## Acceptance Criteria

1. Migration creates `employees(id UUID PK, organization_id UUID FK NOT NULL, user_id UUID FK NOT NULL, track_id UUID FK, level_id UUID FK, assigned_at TIMESTAMPTZ, deactivated_at TIMESTAMPTZ NULL, created_at, updated_at)` with RLS enabled and `(organization_id, user_id)` uniqueness.
2. Migration creates `employee_assignments(id UUID PK, employee_id UUID FK NOT NULL, organization_id UUID FK NOT NULL, role role_enum NOT NULL, manager_employee_id UUID FK NULL, assigned_at TIMESTAMPTZ, deactivated_at TIMESTAMPTZ NULL)` with RLS and partial unique index `(employee_id, organization_id, role) WHERE deactivated_at IS NULL`.
3. A `BEFORE INSERT/UPDATE` trigger on `employee_assignments` rejects self-management (`employee_id = manager_employee_id`).
4. A repository (`EmployeesRepository`) is exposed in the `identity` module; no other module accesses the table directly.
5. Unit test covers RLS isolation (org-A cannot read org-B's employees), self-management rejection, and uniqueness violation.

## Tasks / Subtasks

- [x] Task covering AC #1 — migration creates `employees(id PK, organization_id FK NOT NULL CASCADE, user_id FK NOT NULL CASCADE, career_track_id FK RESTRICT NULL, level_id FK RESTRICT NULL, assigned_at, deactivated_at, created_at, updated_at)` with `UNIQUE (organization_id, user_id)` + RLS sweep. Track/level use RESTRICT (operator must reassign before deleting config) — same defense-in-depth posture as the EXCLUDE constraint on level bands.
- [x] Task covering AC #2 — migration creates `employee_assignments(id PK, employee_id FK CASCADE, organization_id FK CASCADE, role Role, manager_employee_id FK SET NULL, assigned_at, deactivated_at, ...)` with a PARTIAL `UNIQUE (employee_id, organization_id, role) WHERE deactivated_at IS NULL` so a soft-deactivated row can coexist with a fresh re-grant — same shape as Story 2-1's role_assignments. RLS sweep. `manager_employee_id` uses ON DELETE SET NULL so a deleted manager unparents their reports rather than cascading the delete downward.
- [x] Task covering AC #3 — `reject_self_management()` plpgsql function raises with `USING ERRCODE = 'check_violation'` when `NEW.manager_employee_id IS NOT NULL AND NEW.manager_employee_id = NEW.employee_id`; trigger fires BEFORE INSERT OR UPDATE on `employee_assignments`. Three branches covered: INSERT self-manager rejected, UPDATE to self-manager rejected, NULL manager passes via the IS NOT NULL short-circuit.
- [x] Task covering AC #4 — `EmployeesRepository` lives in `apps/api/src/identity/`. Every read/write wraps `withOrgScope(prisma, orgId, fn)`. The IdentityModule exports only this repo; no other module is allowed to touch the tables directly per Arch §5.1.
- [x] Task covering AC #5 — three test surfaces: `identity-migration-shape.test.mjs` pins the SQL invariants (table shape, FK postures, PARTIAL unique, RLS predicate, trigger function + body); `employees-repository.test.mjs` pins withOrgScope wiring on every repo method; `identity-integration.test.mjs` (DATABASE_URL-gated) live-tests RLS isolation (org-A cannot read org-B), self-management rejection on INSERT and UPDATE, partial-unique violation, and the re-grant-after-deactivation flow.

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E6.2
- E2.6

### References

- Arch §6.2 (`employees`, `employee_assignments`)
- PRD §4.2, §6.1
- [Source: planning-artifacts/stories.md — index entry for this story]

### Deferred to follow-up

- **User-org consistency invariant** — the migration does not enforce `users.organization_id = employees.organization_id` at the DB level. RLS WITH CHECK gates `employees.organization_id` against the GUC, but `users.organization_id` is not consulted, so direct-SQL access could theoretically insert an employee with a `user_id` from a different org. The application path (EmployeesRepository inside withOrgScope) closes this hole at the read level. Worth adding a BEFORE INSERT trigger that SELECTs the user's org_id and CHECKs equality — defer to a hardening pass.
- **Multi-step org-graph cycle prevention (A→B→A)** — the trigger only rejects the trivial self-loop. A real cycle check requires a recursive CTE at insert time and has perf implications on bulk import (Story 6-5). Belongs in a future cycle-detection story when promotion-paths actually traverse the graph (Epic 13 territory).
- **Live-DB FK-SET-NULL test for manager deletion** — the migration declares `ON DELETE SET NULL` on `manager_employee_id`, but no integration test asserts the behavior. Worth adding when SeedingService (6-3) or CSV import (6-5) puts pressure on the surface.
- **`check_violation` → structured 400 translation** — the self-management trigger raises SQLSTATE 23514 (check_violation). Epic 7's CRUD service will need to pattern-match this and translate into a structured 400 (the integration test pins on the trigger's prose so this work has a stable signal to match against).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m])

### Debug Log References

- `pnpm --filter @fcm/api exec prisma generate` — green; client regenerated with Employee + EmployeeAssignment models.
- `pnpm --filter @fcm/api run build` — green.
- `pnpm --filter @fcm/api test` — 210 pass + 2 skip (the existing rls-integration + the new identity-integration, both DATABASE_URL-gated). Net additions over Story 6-2 baseline: 23 unit tests + 1 gated integration-suite skip = 24.
- Adversarial review (general-purpose subagent) — 0 BLOCKER, 0 HIGH; 5 LOW (all deferred follow-ups). One cosmetic fix applied directly: the integration suite's teardown deleteMany now runs inside withOrgScope so RLS doesn't silently zero-out the cleanup.

### Completion Notes List

- AC1: `employees` table with the AC-mandated columns + FK postures (org/user CASCADE, track/level RESTRICT) + `(organization_id, user_id)` unique + RLS sweep.
- AC2: `employee_assignments` with the PARTIAL unique on `(employee_id, organization_id, role) WHERE deactivated_at IS NULL` + RLS. Manager FK uses SET NULL so reports unparent on manager deletion.
- AC3: `reject_self_management()` plpgsql function + BEFORE INSERT/UPDATE trigger; raises with SQLSTATE 23514. Predicate skips NULL manager (top-of-hierarchy) and catches both INSERT and UPDATE paths.
- AC4: `EmployeesRepository` in `apps/api/src/identity/employees.repository.ts` is the only module surface that touches the tables. Every method wraps `withOrgScope`; the capturing-fake test pins this on every call.
- AC5: three test surfaces. Migration-shape test (string-shape on the SQL), repo unit test (withOrgScope wiring via capturing fake), and gated integration test (live PG covering RLS isolation, self-mgmt rejection on INSERT and UPDATE, partial-unique violation, re-grant after deactivation).

### File List

- `apps/api/prisma/schema.prisma` (modified) — added `Employee` + `EmployeeAssignment` models; back-relations added to Organization, User, CareerTrack, Level.
- `apps/api/prisma/migrations/20260529000000_employees_and_employee_assignments/migration.sql` (new) — both tables, FK postures, PARTIAL unique, `reject_self_management()` function + trigger, RLS sweep.
- `apps/api/src/identity/employees.repository.ts` (new) — list / find / create / update for employees + listAssignments / listDirectReports / createAssignment / deactivateAssignment for assignments. Every method wraps `withOrgScope`.
- `apps/api/src/identity/identity.module.ts` (new) — registers + exports `EmployeesRepository`.
- `apps/api/src/app.module.ts` (modified) — imports `IdentityModule`.
- `apps/api/test/identity-migration-shape.test.mjs` (new) — 15 tests pinning the SQL invariants.
- `apps/api/test/employees-repository.test.mjs` (new) — 8 tests pinning the repo surface + withOrgScope wiring.
- `apps/api/test/identity-integration.test.mjs` (new) — DATABASE_URL-gated AC5 suite (skips cleanly when DATABASE_URL is unset).

### Adversarial Review Outcomes

- Trigger predicate: correctly rejects INSERT/UPDATE self-management AND permits NULL manager via IS NOT NULL short-circuit. Cycle-prevention beyond the self-loop is out of scope (deferred).
- PARTIAL unique posture matches the Story 2-1 role_assignments precedent verbatim. Schema-vs-DB drift risk on `@@unique` (Prisma can't model partial) is documented in the schema and the migration; same posture as RoleAssignment.
- FK CASCADE matrix verified against the AC + Arch §6.2. Employee→CareerTrack/Level uses RESTRICT (operator must reassign before deleting config) — same defense-in-depth posture as the EXCLUDE constraint from Story 6-2.
- RLS matches Story 2-6 canonical pattern; closed-fail predicate `current_setting('app.current_org_id', true)::uuid` pinned by migration-shape test.
- 0 BLOCKER / 0 HIGH. One cosmetic gap fixed inline: the integration-test teardown deleteMany now wraps in withOrgScope so RLS doesn't silently mask the cleanup.
