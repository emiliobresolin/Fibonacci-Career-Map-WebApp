# Story 7.9: ConfigurationChanged outbox emission on save

Status: done

## Story

As the **scoring engine (Epic 9)**, I want every successful configuration mutation to emit a `configuration.changed` outbox row that names the **change kind** and **lists the affected employees**, so that the bulk-recalc consumer can fan per-employee recalc jobs without re-scanning the org's whole employee set.

## Acceptance Criteria

1. Every successful track/level/layer/requirement/promotion-rule mutation inserts an `outbox_events` row with `event_type = 'configuration.changed'` and payload `{changeType, configEntityType, configEntityId, beforeValue, afterValue, affectedEmployeeIds[], chunkIndex, chunkTotal, actorId, reason}` — in the same DB transaction as the row write.
2. Large affected-employee lists chunk into multiple outbox rows at `AFFECTED_EMPLOYEES_CHUNK_SIZE = 500`. Each chunk carries its own `chunkIndex` (0-based) and `chunkTotal`. Chunks are order-independent (consumer can process in parallel) and stable across retries (`ORDER BY id` on the resolver query).
3. Rolled-back transactions leave NO outbox row. Pinned by a unit test that throws inside the tx callback and asserts zero outbox creates; real-DB enforcement is Prisma's `$transaction` semantics (deferred as F7-9a for end-to-end integration).

## Tasks / Subtasks

- [x] **Schema (BLOCKER fix from review)**: extended `ConfigurationChangedSchema` in `@fcm/domain-contracts` with `changeType`, `affectedEmployeeIds`, `chunkIndex`, `chunkTotal` as optional fields. Without this, Zod's default strip-mode silently drops the new fields before the relay persists to `audit_events`.
- [x] **Helper**: `emitConfigurationChanged` now accepts optional `changeType` + `affectedEmployeeIds`, splits the latter into chunks of ≤ 500, emits N outbox rows with stable `chunkIndex`/`chunkTotal` metadata. Unique `eventId` per chunk; consistent `aggregateId` for downstream grouping.
- [x] **Resolver**: new standalone `resolveAffectedEmployeeIds` in `apps/api/src/configuration/affected-employees.ts` — no DI dep, called inside each service's existing `withOrgScope` tx. Active-employees only (`deactivated_at IS NULL`). Deterministic `ORDER BY id`. Returns `[]` for org-level types (visibility / approval / rollout).
- [x] **Services updated**: career-tracks, levels, layers, requirements, promotion-rules each call the resolver and pass `changeType` (`CREATE` / `UPDATE` / `DEACTIVATE` / `DELETE`) + `affectedEmployeeIds`. Layer DELETE resolves BEFORE the row delete so the JOIN still finds the row.
- [x] **Tests**: new `configuration-changed-7-9.test.mjs` (8 tests covering chunking at boundary, > boundary with odd remainder, eventId uniqueness, aggregateId consistency, rollback behavior, parity across services). Existing 5 service-test fakes now stub `$queryRaw: async () => []`.
- [x] **Dead-code cleanup**: removed `ChangeImpactService.previewImpactWithTx` + `resolveAffectedEmployeeIds` (HIGH H1/H2 — they were orphaned after the resolver was extracted to its own file).
- [x] Build clean; 459 pass / 3 skip / 0 fail (+8 over 7-8's 451). `@fcm/domain-contracts` test suite: 43 pass / 0 fail.

## Dev Notes

### Adversarial Review Outcomes

Reviewer (general-purpose, fresh context) found 1 BLOCKER / 3 HIGH / 3 MEDIUM / 2 LOW. Fixed:

- **BLOCKER B1**: Zod schema stripped the new fields silently — relay would have persisted only the pre-7-9 shape to `audit_events`. **FIXED** by extending `ConfigurationChangedSchema` with optional `changeType`, `affectedEmployeeIds`, `chunkIndex`, `chunkTotal`.
- **HIGH H1+H2 (dead code)**: `previewImpactWithTx` + `resolveAffectedEmployeeIds` on `ChangeImpactService` were never called by the services (which use the standalone `affected-employees.ts` module). **REMOVED**.
- **HIGH H3 (test reassembly hid UUID-sort behavior)**: the previous assertion `reassembled === ids` held only because the fake returned input order; production `ORDER BY id` sorts by uuid collation. **FIXED** — test now uses sortable UUID-shaped ids and asserts sorted membership equivalence (the contract that matters: no losses / no duplicates).

Not changed (deliberate):
- **MEDIUM M1 (DEACTIVATE semantics)**: active-only filter is correct for current schema — no cascade flips employees today.
- **MEDIUM M2 (default `[]` for visibility/approval/rollout)**: explicit by design; org-level events have their own dedicated emit helpers.
- **MEDIUM M3 (AC3 fake-only)**: real-DB integration deferred consistently with F7-1a / F7-2a / F7-4a.
- **LOW L1, L2**: documented invariants.

### Architecture Compliance

- §5.4 — row write + resolver + emit all co-commit inside one `withOrgScope` tx so the audit and the affected-employee list reflect a consistent snapshot.
- §6.4 — `audit_events` partitioned; the new payload fields are JSONB (no schema migration needed on `audit_events`).
- AD-7 (outbox) — the consumer-fanout model is exactly what this story enables.

### Dependencies

- E7.1 → E7.5 (every service this story touches)
- E3.3 (outbox relay must accept the new payload shape — schema-extension change in this commit)

### References

- PRD FR-6.9, FR-6.10
- Arch §5.4, §6.4
- Schema extension: [packages/domain-contracts/src/events/audit.ts#L111](packages/domain-contracts/src/events/audit.ts#L111)
- Resolver: [apps/api/src/configuration/affected-employees.ts](apps/api/src/configuration/affected-employees.ts)

### Deferred to follow-up
- **F7-9a**: real-DB integration test asserting AC3 (rollback leaves no outbox row) end-to-end through Prisma + Postgres. Currently unit-only.

## Dev Agent Record

### Agent Model Used
Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References
- `pnpm --filter @fcm/api run build` → clean
- `pnpm --filter @fcm/domain-contracts test` → 43 pass / 0 fail (schema-extension regression-safe)
- `pnpm test` → 459 pass / 3 skip / 0 fail (+8 over 7-8)
- Adversarial review: 1 BLOCKER / 3 HIGH / 3 MEDIUM / 2 LOW → BLOCKER + 3 HIGH fixed

### File List
Added
- `apps/api/src/configuration/affected-employees.ts` — standalone resolver
- `apps/api/test/configuration-changed-7-9.test.mjs` — chunking + rollback tests

Modified
- `packages/domain-contracts/src/events/audit.ts` — extended `ConfigurationChangedSchema` with 7-9 optional fields; added `ConfigChangeTypeSchema` enum
- `apps/api/src/configuration/audit.ts` — `emitConfigurationChanged` accepts `changeType` + `affectedEmployeeIds`, chunks, emits N rows
- `apps/api/src/configuration/career-tracks.service.ts` — pass changeType + resolved employees
- `apps/api/src/configuration/levels.service.ts` — same
- `apps/api/src/configuration/layers.service.ts` — same (DELETE resolves before row delete)
- `apps/api/src/configuration/requirements.service.ts` — same
- `apps/api/src/configuration/promotion-rules.service.ts` — same
- `apps/api/src/configuration/change-impact.service.ts` — removed dead `previewImpactWithTx` + `resolveAffectedEmployeeIds`
- `apps/api/test/career-tracks-service.test.mjs`, `levels-service.test.mjs`, `layers-service.test.mjs`, `requirements-service.test.mjs`, `promotion-rules-service.test.mjs` — added `$queryRaw: async () => []` stub
