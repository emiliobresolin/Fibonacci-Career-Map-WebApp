# Story 2.1: Identity schema: users, organizations, role_assignments

Status: done

## Story

As an engineer,
I want the identity schema in Prisma,
so that authentication and RBAC have a data model.

## Acceptance Criteria

1. Migration creates `organizations` (slug, name, OIDC config JSONB, `visibility_default`, `approval_workflow_default`, `promotion_mode` enum default `CALIBRATION`, `promotion_mode_changed_at`, `promotion_mode_changed_by`), `users` (email, display_name, FK to `organizations`), and `role_assignments` (`user_id`, `organization_id`, `role` enum EMPLOYEE/MANAGER/ADMIN) with a unique constraint on `(user_id, organization_id, role)`.
2. All tables carry `organization_id NOT NULL` where applicable and are indexed on it.
3. A seed script creates one dev organization, one ADMIN user, and one EMPLOYEE user for local development only.

## Tasks / Subtasks

- [x] Task covering AC #1 — `apps/api/prisma/schema.prisma` declares `Organization`, `User`, `RoleAssignment` models + 4 enums (`Role`, `PromotionMode`, `VisibilityDefault`, `ApprovalWorkflow`). Migration `20260522000000_identity_schema/migration.sql` drops the Story 1-4 `_MigrationProbe` placeholder and creates the three identity tables + 4 enum types. Composite unique on `role_assignments(user_id, organization_id, role)` is enforced as a PARTIAL unique index `WHERE deactivated_at IS NULL` (review patch F1) so a re-grant of a previously-revoked role is a fresh INSERT, not a re-activation.
- [x] Task covering AC #2 — `users.organization_id` and `role_assignments.organization_id` are `UUID NOT NULL` with `@@index` declared on each. The migration emits explicit `CREATE INDEX ... organization_id_idx` statements.
- [x] Task covering AC #3 — `apps/api/prisma/seed.ts` upserts the dev org, an ADMIN user with **both** ADMIN and EMPLOYEE role_assignments (exercises the PRD §4.2 dual-role carve-out — review patch F5), and an EMPLOYEE-only user. `package.json` declares `prisma.seed = "tsx prisma/seed.ts"` so `prisma migrate dev` and `prisma migrate reset` auto-run it; production `prisma migrate deploy` does NOT.

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).
- **Soft-deactivation of role assignments** is enforced via the partial unique index `WHERE deactivated_at IS NULL`. Revoking a role sets `deactivatedAt`; re-granting later inserts a new row. This preserves the audit trail across role rotations and keeps `role_assignment.id` FK-stable for future audit_events references. Prisma can't model partial indexes natively, so the SQL migration hand-edits `WHERE deactivated_at IS NULL` onto the index.
- **Email uniqueness is `(organization_id, email)`**, not global. Multi-tenant installations can have the same person at two orgs as two distinct User rows. Cross-org identity (`externalId` / OIDC subject) is a future story. Case folding is NOT applied today — OIDC integrations sending mixed-case emails (Story E2.2+) will need a Prisma middleware that lowercases-on-write OR a functional unique index on `LOWER(email)`. Tracked in `deferred-work.md`.
- **`promotion_mode_changed_by` is a UUID with no FK** to avoid a circular dependency at bootstrap. The canonical source for "who flipped promotion_mode" is `rollout_mode_transitions` (Story E7.10's append-only history). The field on `organizations` is a denormalized cache of the most-recent transition's actor. Tracked in `deferred-work.md`.
- **Hand-written migration drift risk.** This is the second hand-written migration (Story 1-4's init was the first). Future schema changes MUST go through `prisma migrate dev --name <slug>` against a live Postgres so Prisma generates the SQL — verified-against-shadow-DB drift catches divergence at PR time. A CI step that asserts `prisma migrate diff --exit-code` between schema and live DB is tracked in `deferred-work.md`.

### Dependencies

- E1.4

### References

- Arch §6.2 (data model — organizations / users / role_assignments shape)
- Arch §10.2 (role model — EMPLOYEE/MANAGER/ADMIN, dual Admin+Employee carve-out)
- PRD §4.2 (role assignment rules, "exactly one role per (user, org)" carve-out)
- PRD FR-1.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Amelia — bmad-dev-story skill)

### Debug Log References

- RED phase: 9 identity-schema scaffold assertions failed against the `MigrationProbe`-only schema state.
- GREEN phase attempt 1: schema + migration + seed landed. The Story 1-4 scaffold test `schema declares the _MigrationProbe table` failed because Story 2-1 explicitly drops that model. Updated the Story 1-4 test to accept either the placeholder (pre-2-1) OR the identity-schema models (2-1+).
- Code review pass (1 combined reviewer): 7 findings. 4 patched in-story (F1 deactivatedAt + partial unique, F4 seed update fields populated, F5 dual-role carve-out in seed, F7 disconnect ordering); 3 deferred (F2 denormalized promotion_mode_changed_by cleanup alongside E7.10, F3 CI drift detection via `prisma migrate diff --exit-code`, F6 OIDC externalId + email case folding at E2.2).
- 110/110 scaffold tests green after patches.

### Completion Notes List

- **AC1 — schema & migration:** all three tables present, four enums (`Role`, `PromotionMode`, `VisibilityDefault`, `ApprovalWorkflow`), composite unique on `role_assignments` enforced via partial index for soft-deactivation, `oidcConfig` modeled as nullable JSONB. The `_MigrationProbe` placeholder is dropped at the head of the migration so a successful `prisma migrate deploy` leaves the placeholder gone and the identity tables present.
- **AC2 — tenant-scope:** `users.organization_id` and `role_assignments.organization_id` are `UUID NOT NULL`; both have `@@index` declared (Prisma) and explicit `CREATE INDEX` in the SQL.
- **AC3 — seed:** uses `tsx prisma/seed.ts` (Prisma `prisma.seed` config). Three role assignments total: admin's ADMIN + admin's EMPLOYEE (dual-role) + employee's EMPLOYEE. Idempotent and authoritative — re-running converges on source-file values.
- **Workspace integration:** `apps/api/package.json` declares the Prisma `seed` config + a `prisma:seed` script. `tsx` added as a devDep. `postinstall: prisma generate` continues to keep the typed client in sync after every install.

### File List

- `apps/api/prisma/schema.prisma` (modified — replaced MigrationProbe with Organization + User + RoleAssignment + 4 enums)
- `apps/api/prisma/migrations/20260522000000_identity_schema/migration.sql` (new — drops `_MigrationProbe`, creates the three tables + enums + partial unique index)
- `apps/api/prisma/seed.ts` (new — idempotent + authoritative dev seed exercising the dual-role carve-out)
- `apps/api/package.json` (modified — `prisma.seed` config, `prisma:seed` script, `tsx` devDep)
- `tests/scaffold/identity-schema-structure.test.mjs` (new — 9 assertions)
- `tests/scaffold/prisma-structure.test.mjs` (modified — placeholder assertion now spans the placeholder-removal transition)

### Review Findings

- [x] [Review][Patch] (F1) `RoleAssignment.deactivatedAt` + partial unique index `WHERE deactivated_at IS NULL` so role revocation is soft-delete and preserves audit-trail FKs [apps/api/prisma/schema.prisma, apps/api/prisma/migrations/20260522000000_identity_schema/migration.sql]
- [x] [Review][Patch] (F4) Seed `update` fields populated with the same shape as `create` so re-running converges on current source-file values (was a silent no-op upsert) [apps/api/prisma/seed.ts]
- [x] [Review][Patch] (F5) Seed grants the admin user BOTH ADMIN and EMPLOYEE roles, exercising the PRD §4.2 dual-role carve-out + giving the composite unique a free smoke test [apps/api/prisma/seed.ts]
- [x] [Review][Patch] (F7) Seed top-level orchestration awaits `prisma.$disconnect()` before `process.exit` so disconnect failures surface as a warning and the exit code is correct [apps/api/prisma/seed.ts]
- [x] [Review][Defer] (F2) Drop the denormalized `organizations.promotion_mode_changed_by` OR add a real FK + index — `rollout_mode_transitions` (Story E7.10) is the canonical source. Revisit alongside E7.10
- [x] [Review][Defer] (F3) CI step that runs `prisma migrate diff --exit-code` to catch drift between hand-written migrations and the Prisma-generated SQL. Belongs in CI expansion
- [x] [Review][Defer] (F6) Add `User.externalId` (OIDC subject identifier) + case-fold email on write. Natural fit for Story E2.2 (OIDC / SSO login)

## Change Log

- 2026-05-21 — Story 2-1 implemented. Identity schema baseline: Organization + User + RoleAssignment + 4 enums. Hand-written migration drops the Story 1-4 `_MigrationProbe` placeholder and creates the three tables with the composite unique on `role_assignments(user_id, organization_id, role)`. Idempotent dev seed exercises the PRD §4.2 dual-role carve-out (admin user has both ADMIN and EMPLOYEE assignments). 9 new scaffold tests + 1 Story 1-4 scaffold test updated to span the placeholder-removal transition. Full scaffold suite 110/110 green; repo-wide typecheck clean.
- 2026-05-21 — Code review pass surfaced 7 findings. 4 patched: F1 RoleAssignment.deactivatedAt + partial unique index, F4 seed upserts populate update fields, F5 seed exercises dual-role carve-out, F7 seed disconnect ordering. 3 deferred (F2 denormalized promotion_mode_changed_by cleanup with E7.10, F3 CI drift detection, F6 OIDC externalId + case folding at E2.2). Status: backlog → in-progress → review → done.
