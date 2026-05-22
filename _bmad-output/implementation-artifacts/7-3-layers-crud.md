# Story 7.3: Layers CRUD

Status: done

## Story

As an **ADMIN**, I want to **create, read, update, and delete Layers within a Level**, with the "every level must have at least one layer" invariant enforced server-side, so that **the configuration tree cannot end up with an empty level** — which would break the Requirements / Evidence layout downstream.

## Acceptance Criteria

1. CRUD endpoints implemented under `/v1/levels/:levelId/layers` (list/create) and `/v1/layers/:id` (findById/patch/delete); ADMIN-only writes, authenticated-only reads (same posture as 7-1/7-2). Unknown `levelId` → 404.
2. Each level retains at least one layer; the last-remaining-layer delete returns `409 layer_min_violation` with `level_id`. Race-safe via `pg_advisory_xact_lock(hashtextextended(level_id))` so two concurrent deletes serialize on the same level.
3. Every create/update/delete emits one `configuration.changed` outbox event with `configEntityType: 'layer'`, payload validated by `safeParseAuditEvent` (including the DELETE `afterValue: null` shape).

## Tasks / Subtasks

- [x] **F7-2b: lift shared audit helper** — extracted `emitConfigurationChanged` + `ConfigEntityType` union to `apps/api/src/configuration/audit.ts`. Refactored career-tracks (7-1) and levels (7-2) services to use it. Wire format unchanged (regression test count steady at 348 before adding 7-3 tests).
- [x] **AC1 — Layers service + controller + module bindings** (`layers.service.ts`, `layers.controller.ts`, `configuration.module.ts`).
- [x] **AC2 — last-layer protection with advisory lock** (`pg_advisory_xact_lock(hashtextextended(level_id::text, 0))` BEFORE the count, inside the same `withOrgScope` tx).
- [x] **AC3 — outbox audit emission** via the shared helper; DELETE shape `afterValue: null` is schema-validated.
- [x] Tests: `layers-service.test.mjs` (+15 covering 404 on unknown level, audit shape for CREATE + DELETE, partial-update no-op, last-layer 409, lock-before-count ordering, P2002 collision, validation). `layers-controller-wiring.test.mjs` (+4 pinning RBAC).
- [x] Build clean; 366 pass / 3 skip / 0 fail (+18 net over 7-2's 348).

## Dev Notes

### Previous Story Intelligence (7-2, done)

- Mirror the service-writes-via-tx pattern; reads through the repo.
- Adversarial review will be tough on race conditions — the layer-min check is read-then-write and needs a serialization mechanism.
- Empty-PATCH no-op is the project convention.

### Architecture Compliance

- §5.1 — configuration module ownership.
- §5.4 — row write + audit emit co-commit in one tx.
- §6.1 — layers are hard-deleted (no `active` column); the AC2 guard substitutes for soft-delete here.
- §6.2 — `(level_id, name)` unique; `requirements.layer_id` is `ON DELETE CASCADE` so deleting a layer cascades-deletes its requirements (intentional pre-Epic-8; revisit when evidence lands).

### Dependencies

- E7.2 (Levels — `LevelsRepository` for parent-existence check)
- E2.6 (RLS policy `tenant_isolation_layers`)
- E3.3 (outbox relay for `configuration.changed`)

### References

- PRD FR-6.3
- Arch §5.1, §5.4, §6.1, §6.2
- Schema: [schema.prisma#L392](apps/api/prisma/schema.prisma#L392)
- Precedent: [layers.repository.ts](apps/api/src/configuration/layers.repository.ts), [career-tracks.service.ts](apps/api/src/configuration/career-tracks.service.ts)

## Dev Agent Record

### Agent Model Used

Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References

- `pnpm --filter @fcm/api run build` → clean
- `pnpm test` → 366 pass / 3 skip / 0 fail (+18 vs. 7-2 baseline)
- Adversarial review: 1 BLOCKER (B1: last-layer race), 3 HIGH, 3 MEDIUM, 5 LOW

### Adversarial Review Outcomes

Reviewer (general-purpose, fresh context) found:

- **BLOCKER B1 — last-layer race**: `tx.layer.count` + `tx.layer.delete` under READ COMMITTED doesn't serialize concurrent deletes. **FIXED** with `pg_advisory_xact_lock(hashtextextended(level_id::text, 0))` BEFORE the count, inside the same `withOrgScope` tx. Lock auto-releases at commit/rollback. Test pins lock-before-count ordering by inspecting captured `$executeRaw` calls.
- **HIGH H2 — DELETE audit shape never schema-validated**: **FIXED** — the AC2-success test now runs `safeParseAuditEvent` on the DELETE candidate (`afterValue: null`).
- **LOW L2 — docstring uppercase / wire lowercase mismatch**: **FIXED** — docstring updated to `layer_min_violation` (lowercase, matches wire).

Not changed (deliberate):

- H1 (relay→audit_events mapping): existing 7-1 outbox-relay-persistence tests already cover this; no regression risk in this story.
- H3 (cross-controller orphan path): matches 7-2 precedent; RLS blocks cross-tenant.
- M1 (snake_case in 409 body): consistent with 7-2's `conflicting_level_id`; codebase pattern.
- M2/M3 (type drift / withOrgScope scope): repo opens its own withOrgScope (verified by reading levels.repository.ts).
- L1/L3/L4/L5: cosmetic / verified clean.

### File List

Added
- `apps/api/src/configuration/audit.ts` — shared `emitConfigurationChanged` helper (F7-2b)
- `apps/api/src/configuration/layers.service.ts`
- `apps/api/src/configuration/layers.controller.ts`
- `apps/api/test/layers-service.test.mjs`
- `apps/api/test/layers-controller-wiring.test.mjs`

Modified
- `apps/api/src/configuration/configuration.module.ts` — register `LayersController` + `LayersService`
- `apps/api/src/configuration/career-tracks.service.ts` — switch to shared helper (no behavior change)
- `apps/api/src/configuration/levels.service.ts` — switch to shared helper (no behavior change)
