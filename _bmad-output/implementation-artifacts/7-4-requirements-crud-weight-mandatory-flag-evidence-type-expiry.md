# Story 7.4: Requirements CRUD (weight, mandatory flag, evidence type, expiry)

Status: done

## Story

As an **ADMIN**, I want to **create, read, update, and (soft-)delete Requirements within a Layer**, so that **operators can configure what evidence each layer's eligibility evaluator scores against, without ever vaporizing requirement rows that downstream evidence (Epic 8) will FK-reference**.

## Acceptance Criteria

1. CRUD endpoints under `/v1/layers/:layerId/requirements` (list/create) and `/v1/requirements/:id` (find/patch/delete); ADMIN-only writes, authenticated-only reads. Unknown `layerId` → 404.
2. Fields: `name`, `description` (optional), `evidenceType` enum `FILE|URL|TEXT|STRUCTURED` (derived from `Prisma.EvidenceType` at runtime), `weight` positive integer, `mandatory` boolean, `expiryMonths` null-or-positive integer.
3. Every mutation emits one `configuration.changed` outbox event via the shared helper.
4. **No hard delete.** `DELETE /v1/requirements/:id` soft-deactivates (`active=false`). The service deliberately has no `delete`/`remove`/`destroy` method; pinned by tests so a future maintainer can't add one without breaking the build.

## Tasks / Subtasks

- [x] `RequirementsService` + `RequirementsController`, registered in `configuration.module.ts`.
- [x] EvidenceType validation derives from `Object.values(EvidenceType)` (reviewer-driven drift hardening).
- [x] Soft-deactivate only; idempotent on already-inactive rows; no hard-delete method exists.
- [x] Audit emission via shared helper (`configEntityType: 'requirement'`).
- [x] Tests: 22 service tests + 5 controller-wiring tests including AC4 "no hard delete method" guard + EvidenceType drift detector + layerId-stability-on-PATCH pin.
- [x] Build clean; 389 pass / 3 skip / 0 fail (+23 over 7-3's 366).

## Dev Notes

### Adversarial Review Outcomes

Reviewer (general-purpose, fresh context) found 0 BLOCKER / 2 HIGH / 4 MEDIUM / 4 LOW. Fixed:

- **HIGH #1 (EvidenceType drift)**: `VALID_EVIDENCE_TYPES` now derives from `Object.values(EvidenceType)`. A 5th enum variant in `schema.prisma` is automatically accepted. Added a test pinning that the runtime enum matches the documented set so the test (not the service) breaks if the schema drifts undocumented.
- **HIGH #2 (layerId stability on PATCH)**: pinned by a `before.beforeValue.layerId === after.afterValue.layerId` assertion in the update test so future re-parenting work is forced through a deliberate rethink.
- **LOW #6 (dead `defaultValue`)**: removed the unused `defaultValue` parameter from `validateBool`. Caller now defaults explicitly.

Not changed (deliberate):
- **MEDIUM #3 (bare `?includeInactive` truthiness)**: precedent from 7-1; project-wide cleanup not in scope.
- **MEDIUM #4 (DB CHECK for upper bounds)**: filed as **F7-4a** (add `weight <= 1000` + `expiry_months <= 600` CHECKs in a migration). Service caps acceptable for MVP since the service is the only writer pre-Epic-8.
- **MEDIUM #5 (audit-shape test is structural)**: parity with 7-1/7-2/7-3; integration test deferred (same fate as F7-1a / F7-2a).
- **LOW #7/8/9**: cosmetic or already covered by HIGH #1.

### Architecture Compliance

- §5.1 — `RequirementsService` lives in `configuration` module.
- §5.4 — row write + audit emit co-commit via `withOrgScope`.
- §6.1 — soft-deactivate only; no hard delete. AC4 makes this explicit at the service surface.
- §6.2 — `requirements_weight_positive` + `requirements_expiry_months_positive` DB CHECKs are the lower-bound source of truth; service adds upper-bound + type guards.

### Dependencies

- E7.3 (Layers — `LayersRepository.findById` for parent-existence)
- E2.6 (RLS policy `tenant_isolation_requirements`)
- E3.3 (outbox relay)

### References

- PRD FR-6.4, §8.4
- Arch §5.1, §5.4, §6.1, §6.2
- Schema: [schema.prisma#L415](apps/api/prisma/schema.prisma#L415)
- Migration: [20260528000000_configuration_tables/migration.sql#L155](apps/api/prisma/migrations/20260528000000_configuration_tables/migration.sql#L155)
- Precedent: [career-tracks.service.ts](apps/api/src/configuration/career-tracks.service.ts), [audit.ts](apps/api/src/configuration/audit.ts)

## Dev Agent Record

### Agent Model Used

Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References

- `pnpm --filter @fcm/api run build` → clean
- `pnpm test` → 389 pass / 3 skip / 0 fail
- Adversarial review: 0 BLOCKER / 2 HIGH / 4 MEDIUM / 4 LOW → HIGHs + LOW #6 fixed

### Deferred to follow-up
- **F7-4a**: migration adding `requirements_weight_max` + `requirements_expiry_months_max` CHECK constraints.

### File List

Added
- `apps/api/src/configuration/requirements.service.ts`
- `apps/api/src/configuration/requirements.controller.ts`
- `apps/api/test/requirements-service.test.mjs`
- `apps/api/test/requirements-controller-wiring.test.mjs`

Modified
- `apps/api/src/configuration/configuration.module.ts` — register controller + service
