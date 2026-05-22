# Story 7.2: Levels CRUD with non-overlapping band enforcement

Status: done

## Story

As an **ADMIN** of an organization,
I want to **create, read, update, and deactivate Levels within a Career Track, with the score-band non-overlap invariant enforced server-side**,
so that **the configuration surface cannot produce a tree whose score bands collide — which would break the eligibility evaluator (Epic 9) and the map projection (Epic 10)**.

## Acceptance Criteria

1. **CRUD endpoints**: `GET /v1/career-tracks/:trackId/levels`, `GET /v1/levels/:id`, `POST /v1/career-tracks/:trackId/levels`, `PATCH /v1/levels/:id`, `DELETE /v1/levels/:id`. List + findById are authenticated-only (MANAGER + EMPLOYEE need to read level names for UI rendering — same posture as career-tracks per 7-1). POST / PATCH / DELETE are `@Roles('ADMIN')`. Career track must exist and belong to the actor's organization; a request for an unknown `trackId` returns `404 not_found`.
2. **Band-overlap rejection**: any create or update that would cause two `active=true` levels in the same career track to have overlapping inclusive `[score_band_start, score_band_end]` ranges is rejected as `409 LEVEL_BAND_OVERLAP`. Error body includes `conflicting_level_id` (the existing level whose band overlaps) and the conflicting band coordinates. The check rides the DB exclusion constraint `levels_band_non_overlap` (already shipped by Story 6-2 in `20260528000000_configuration_tables`); the service translates Postgres SQLSTATE `23P01` (exclusion_violation) on that constraint name into the structured 409. Do not reimplement the check in app code — the DB is the source of truth, app code only translates.
3. **Soft deactivation (no hard delete)**: `DELETE /v1/levels/:id` flips `active=false`. Hard delete is forbidden (audit + historical-snapshot integrity). Deactivating an already-inactive level is idempotent and emits no audit event. Deactivation succeeds even when employees are currently assigned to the level (the level row remains FK-referenced; only its band is freed up for a new active level to occupy).
4. **Audit emission on every mutation**: create / update / deactivate emit one `configuration.changed` event via the transactional outbox (Epic 3), co-committed with the row write. Payload follows the same shape used by `CareerTracksService` (Story 7-1): `before.configEntityType='level'`, `before.field='*'`, `beforeValue`/`afterValue` carry full row state. Empty PATCH (`{}`) is a no-op and emits no audit event.
5. **Integration test coverage**: at least one test covers (a) a valid two-band create that touches at the boundary (e.g. `[0,99]` then `[100,200]`) and succeeds, (b) an overlapping create that returns the structured 409 and emits **no** outbox row, and (c) a gap-tolerant update that shifts a band into a previously-empty gap without conflict. Tests run under the existing `pnpm test` harness alongside 7-1's tests and remain green.

## Tasks / Subtasks

- [x] **AC1 — service + controller wiring**
  - [x] Add `LevelsService` in `apps/api/src/configuration/levels.service.ts`, mirroring `career-tracks.service.ts` (constructor injects `PrismaService` + `LevelsRepository` + `CareerTracksRepository`; all writes go through `withOrgScope`).
  - [x] Add `LevelsController` in `apps/api/src/configuration/levels.controller.ts` with routes per AC1. Nested-resource shape: list/create live under `/v1/career-tracks/:trackId/levels`; findById/patch/delete live at `/v1/levels/:id`.
  - [x] Validate the parent `trackId` exists for the actor's org on list/create; surface `404 not_found` if absent.
  - [x] Register both in `configuration.module.ts`.
  - [x] Apply `@Roles('ADMIN')` only on POST/PATCH/DELETE; leave GETs authenticated-only (matches 7-1 read-auth nuance).
- [x] **AC2 — overlap → structured 409**
  - [x] In the service, wrap `tx.level.create` / `tx.level.update`; `isExclusionViolation(err)` detects the violation via SQLSTATE 23P01 + constraint name **or** message substring (covers both `PrismaClientKnownRequestError` P2010 and `PrismaClientUnknownRequestError`).
  - [x] After detection, `findOverlappingLevel(...)` runs a parameterized `$queryRaw` with `int4range(start, end, '[]') && int4range(...)` inside `withOrgScope` to identify the conflicting active peer. Lookup excludes the row being updated. Best-effort: on lookup failure, returns `conflicting_level_id: null` rather than masking the original 409.
  - [x] Reject `scoreBandStart < 0`, `scoreBandEnd <= scoreBandStart`, non-integers, and out-of-bounds at the service layer (400 before DB).
- [x] **AC3 — soft deactivation**
  - [x] `DELETE` route → `service.deactivate(orgId, id, actor)`. Already-inactive returns current state, skips audit emission (idempotent).
  - [x] Documented in service header: no FK-reference precheck against `employees.level_id` — we're not deleting, just flipping `active`.
- [x] **AC4 — outbox audit emission**
  - [x] `emitConfigChanged` mirrors `career-tracks.service.ts` byte-for-byte except `configEntityType: 'level'`. No refactor of 7-1's file (intentional duplication; see Deferred F7-2b).
  - [x] `serializeRow` covers all 11 columns including `careerTrackId` and ISO-stringified timestamps.
  - [x] Empty PATCH (`{}`) ⇒ no audit row, no DB write (pinned by test).
- [~] **AC5 — tests** (partially complete; integration AC5(a)/(b)/(c) deferred — see F7-2a)
  - [x] `apps/api/test/levels-service.test.mjs` — +22 tests covering: 404 on unknown track, audit-shape pin via `safeParseAuditEvent`, before/after payload, idempotent deactivate, empty-patch no-op, partial-band-update merge, P2002 levelCode collision → 409, exclusion-constraint translation via `PrismaClientUnknownRequestError`, P2010 message-substring branch, fallback to `null` peer (concurrency case), defense-against-mistranslation of plain Error + name-only update, levelCode/name/band validation (positive + negative).
  - [x] `apps/api/test/levels-controller-wiring.test.mjs` — +4 tests pinning ADMIN-only on writes, authenticated-only on reads, no @Public, no class-level decorators.
  - [ ] **AC5(a)/(b)/(c) real-DB integration tests — DEFERRED as F7-2a.** The API package still has no real-DB harness (same situation as 7-1's `F7-1a`). The exclusion-constraint predicate is exercised by Postgres directly; what's deferred is end-to-end orchestration through the controller against a live Postgres. Not honest to mark this `[x]`.
- [x] `pnpm --filter @fcm/api run build` → clean; `pnpm test` → 345 pass / 3 skip / 0 fail (+22 vs. 7-1 baseline of 323+3).

## Dev Notes

- Architecture patterns and constraints are captured in the References block; the dev agent MUST read those before writing code.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4: every write that must be externally observable rides the outbox in the **same** transaction as the row mutation.
- The DB-level `levels_band_non_overlap` exclusion constraint (Story 6-2 migration) is the source of truth for AC2. App code only **translates** the violation into a structured 409 with helpful context. Do not re-implement the predicate in TypeScript — race conditions would make a TS-only check unsafe anyway.
- Mirror `CareerTracksService` (Story 7-1) for the audit-emission pattern; the dev agent should diff their new file against [career-tracks.service.ts](apps/api/src/configuration/career-tracks.service.ts) and justify every divergence.

### Previous Story Intelligence (Story 7-1, done)

From [7-1-career-tracks-crud-api-audit.md](_bmad-output/implementation-artifacts/7-1-career-tracks-crud-api-audit.md):

- **Service writes directly via the tx client**, not via the repository, so the row write + the outbox emit co-commit. Same pattern here for `LevelsService`.
- **Read auth nuance**: GETs are authenticated-only, mutations are ADMIN-only. Replicate.
- **Empty PATCH** (`{}`) is a no-op (no write, no audit). Replicate — and pin it with a test.
- **Audit payload uses `field: '*'`** sentinel; whole-row `beforeValue`/`afterValue`. Validate the payload through `safeParseAuditEvent` (test pin).
- **Validation helpers** (`validateName`, etc.) live as module-private functions; they are not exported. Mirror.
- **Deferred to follow-up F7-1a**: real-DB integration test for the slug-collision 409 + RLS isolation. If the API package still lacks a real-DB harness, AC5(b)/(c) for 7-2 follow the same fate — surface a `F7-2a` follow-up rather than skipping.

### Architecture Compliance

- **§5.1** — configuration module owns this code. Do not leak `LevelsService` into other modules.
- **§5.4** — transactional boundary: the row write + outbox row are one transaction. Done via `withOrgScope(prisma, orgId, async (tx) => { ... })`.
- **§6.1** — soft deactivation only (`active = false`); no hard delete. UUID PKs; `created_at`/`updated_at`.
- **§6.2** — `levels` schema is already in place; see [schema.prisma](apps/api/prisma/schema.prisma#L364-L387) and the EXCLUDE constraint at [20260528000000_configuration_tables/migration.sql:103-108](apps/api/prisma/migrations/20260528000000_configuration_tables/migration.sql#L103).
- **§10.3** — defense-in-depth: org isolation via the RLS policy `tenant_isolation_levels` (Story 2-6 + 6-2 migration). The service goes through `withOrgScope`; do not bypass.

### Library / Framework Requirements

- NestJS 10.x (existing). No new deps. Use `@nestjs/common` exceptions: `BadRequestException`, `ConflictException`, `NotFoundException`.
- `@prisma/client`: use the already-generated client. Do NOT regenerate or change the schema in this story.
- For the `int4range` overlap query in `findOverlappingLevel`, use `tx.$queryRaw` with parameter binding — never string-concatenate.

### File Structure Requirements

**Add:**
- `apps/api/src/configuration/levels.service.ts`
- `apps/api/src/configuration/levels.controller.ts`
- `apps/api/test/levels-service.test.mjs`
- `apps/api/test/levels-controller-wiring.test.mjs`
- `apps/api/test/levels-band-overlap-integration.test.mjs` *(only if a real-DB harness exists in the API package; otherwise defer as F7-2a)*

**Modify:**
- `apps/api/src/configuration/configuration.module.ts` — register `LevelsController` + `LevelsService`.

**Do NOT modify:**
- `apps/api/prisma/schema.prisma` — the `Level` model is already complete.
- `apps/api/prisma/migrations/` — the exclusion constraint already exists.
- `career-tracks.service.ts` — no audit-helper refactor in this story (write a duplicate, surface a follow-up).
- `apps/api/src/configuration/levels.repository.ts` — the existing repo is sufficient for reads. The service writes directly via the tx client for atomicity, exactly like 7-1.

### Testing Requirements

- **Unit (mocked Prisma, fast)**: `levels-service.test.mjs` + `levels-controller-wiring.test.mjs`. Use the same harness style as `career-tracks-service.test.mjs` — node:test, mocked PrismaService, in-memory actor context. Target +12 to +18 new tests. **Status-quo baseline**: 323 pass / 3 skip / 0 fail (post-7-1). After this story: ≥335 pass / 3 skip / 0 fail.
- **Integration (real DB)**: AC5(a)/(b)/(c). If the API package has no real-DB harness yet, defer as `F7-2a` — do not fake-pass the AC.
- Pin the audit-payload shape with `safeParseAuditEvent` from `@fcm/domain-contracts` (43-test suite). If the helper does not yet have a `'level'` configEntityType variant, **stop and surface this as a blocker** rather than weakening the validation — Epic 3's contract is load-bearing.
- Always run `pnpm --filter @fcm/api run build` and `pnpm test` before marking tasks complete (per project convention from autonomous-team mode).

### Dependencies

- **E6.2** — `levels` table + `levels_band_non_overlap` exclusion constraint (done).
- **E2.6** — RLS policy `tenant_isolation_levels` (done).
- **E3.3** — outbox-relay worker for `configuration.changed` (done; Story 7-1 already exercises it).
- **E7.1** — `CareerTracksService` audit-emission pattern (done; mirror exactly).

### References

- PRD FR-6.2, §8.2 (band invariants)
- Arch §5.1, §5.4, §6.1, §6.2 (Level table + exclusion constraint), §10.3
- Planning: [stories.md — Epic 7 index](_bmad-output/planning-artifacts/stories.md)
- Implementation precedent: [career-tracks.service.ts](apps/api/src/configuration/career-tracks.service.ts), [career-tracks.controller.ts](apps/api/src/configuration/career-tracks.controller.ts)
- DB constraint: [20260528000000_configuration_tables/migration.sql:103-108](apps/api/prisma/migrations/20260528000000_configuration_tables/migration.sql#L103-L108)
- Existing repo (used for reads): [levels.repository.ts](apps/api/src/configuration/levels.repository.ts)

### Project Context

- Communication: English; Document output: English.
- Autonomous-team mode is active: dev → test → review → commit → next, without per-phase approval. No push, no amend, no hook-skip. Halt only on real ambiguity.
- Concrete next steps: frame as "I'll do X now", no padding. Quote runnable commands.

## Dev Agent Record

### Agent Model Used

Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References

- `pnpm --filter @fcm/api run build` → clean (`tsc`)
- `pnpm test` (post-review) → 348 pass / 3 skip / 0 fail (baseline was 323 + 3 after 7-1; +25 tests this story)
- Skipped tests unchanged from baseline (3 RLS-DB integration tests that require `DATABASE_URL`)
- Adversarial review pass: pre-review 345 pass; +3 regression tests added during the review pass (plain-Error not mistranslated; name-only update not fabricating 409; positive-acceptance levelCode shapes)

### Completion Notes List

**Approach**:
- `LevelsService` wraps `LevelsRepository` (reads) and writes directly through the tx client (writes). Same atomicity rationale as 7-1: the row write + the `configuration.changed` outbox emit must co-commit so audit and state never diverge.
- AC1 nested-resource shape: list/create at `/v1/career-tracks/:trackId/levels`; findById/update/deactivate at `/v1/levels/:id`. Mirrors how org-scoped sub-resources sit elsewhere — list is filtered by parent, mutations identify the row directly.
- AC1 unknown-trackId surface: `assertTrackExists` runs `tracksRepo.findById` before the write tx. The RLS scope still protects against cross-org access, but a friendly 404 is better UX than letting the FK constraint fail with `P2003`.
- AC2 detection strategy: `isExclusionViolation` accepts three paths so it survives Prisma version churn — `PrismaClientKnownRequestError` with SQLSTATE 23P01 + constraint name in `meta`; same error type with the constraint name in `err.message`; `PrismaClientUnknownRequestError` with the constraint name in `err.message`. There's also a plain-`Error` branch so the service can be unit-tested without instantiating Prisma's internal error types.
- AC2 peer enrichment: `findOverlappingLevel` uses parameterized `$queryRaw` with `int4range(start, end, '[]') &&` to match the DB constraint's overlap predicate exactly. The query opens a separate `withOrgScope` (the original write tx already rolled back when the constraint fired), so it inherits the RLS GUC and can't leak across tenants.
- AC3 idempotent deactivate: matches 7-1's pattern — `before.active === false` returns the current row without emitting an audit event, so a UI sending two delete clicks doesn't pollute the audit log.
- AC4 audit payload: `configEntityType: 'level'`, `field: '*'` sentinel, full row in `beforeValue`/`afterValue`. `safeParseAuditEvent` from `@fcm/domain-contracts` accepts the shape (the `configEntityType` schema is `z.string().min(1)`, so 'level' validates).
- Partial-band update: the service fetches `before` inside the tx, merges the proposed `scoreBandStart`/`scoreBandEnd` with the unchanged side, then validates `end > start` against the merged values. Pinned by a test where only `scoreBandStart` is supplied.

**Validation**:
- `levelCode`: `/^[A-Za-z0-9][A-Za-z0-9_\-]{0,31}$/` (1–32 chars, letter/digit start). Covers org-custom codes like "Staff" or "Senior" as well as "L1"/"L2".
- `name`: required, trimmed, ≤200 chars.
- `scoreBandStart`/`scoreBandEnd`: non-negative integers, ≤1,000,000, end strictly greater than start. DB's `levels_score_band_start_nonneg` + `levels_score_band_order` CHECK constraints remain in place as defense-in-depth.
- `displayOrder`: non-negative integer, default 0.

**Adversarial review outcomes**:

Independent reviewer (claude-sonnet, fresh context) ran a cynical review and found 0 BLOCKER / 4 HIGH / 7 MEDIUM / 4 LOW. Fixes applied this pass:

- **HIGH H1 (concurrency)**: added a code comment in `translateWriteError` documenting that `conflicting_level_id: null` can mean "peer deactivated between failed write and enrichment" so the admin UI knows to re-fetch.
- **HIGH H2 (sentinel UUID)**: removed `lookupTrackId` and its `'00000000-…'` fallback. `update()` now captures `before.careerTrackId` inside the tx and passes it (or `null` if `before` was missing) into the catch.
- **HIGH H3 (plain-Error over-match)**: dropped the plain-`Error` branch in `isExclusionViolation`. Tests now instantiate `PrismaClientUnknownRequestError` directly. Added a regression test pinning that an unrelated plain `Error` whose message accidentally mentions the constraint name is propagated as-is, not mistranslated.
- **HIGH-leaning B2 (update fabricates `{0,0}` band)**: `update()` no longer fabricates a band when the caller didn't touch one. If an exclusion violation somehow fires on a name-only update (unreachable today, reachable if an `active`-toggle path lands later), the error rethrows. Pinned by a regression test.
- **MEDIUM M1 (levelCode regex)**: tightened to `/^[A-Za-z0-9]([A-Za-z0-9_\-]{0,30}[A-Za-z0-9])?$/` — must start AND end with letter or digit; trailing `_`/`-` rejected. Single-letter codes still allowed. Added positive-acceptance test for the shapes orgs actually use.
- **MEDIUM M6 (AC5 honesty)**: unticked AC5 in the spec. Integration test deferred as F7-2a, not marked `[x]`.
- **MEDIUM M7 (dead block)**: removed the empty `if (...) { ... }` placeholder at the old line 144 area.
- **LOW L3 (swallowed lookup error)**: `findOverlappingLevel`'s catch now logs at `warn` via Nest's `Logger`.

Not fixed (deliberate, with rationale):
- **M2 Unicode normalization**: out of scope for MVP; no PRD requirement.
- **M3 `SCORE_BAND_MAX` not DB-enforced**: documented; defense-in-depth at service layer is sufficient.
- **M5 `findUnique` without explicit `organizationId`**: RLS is the enforcement layer; matches 7-1's deliberate pattern (Arch §10.3 Layer 3).
- **L1 UUID regex permissiveness**: consistent with 7-1; RLS catches cross-tenant ids anyway.
- **L2 typing nuance**: cosmetic.
- **L4 `CreateLevelInput` name shadow**: cosmetic; service version omits `careerTrackId` because it's a route param, not a body field.

**Deferred to follow-up**:
- **F7-2a**: real-DB integration test for AC5(a)/(b)/(c). The API package still lacks a real-DB harness (same situation as 7-1's `F7-1a`); add a single shared harness as a side project rather than per-story.
- **F7-2b**: lift the duplicated `emitConfigChanged` + `serializeRow` from `career-tracks.service.ts` + `levels.service.ts` to a shared `configuration/audit.ts` helper. Intentionally kept duplicated in this story to avoid touching 7-1's file; revisit when story 7-3 (Layers) lands and we have three call sites.

### File List

Added
- `apps/api/src/configuration/levels.service.ts` — service layer with audit emission + band-overlap translation
- `apps/api/src/configuration/levels.controller.ts` — REST endpoints (nested under `/v1/career-tracks/:trackId/levels` for list/create; flat `/v1/levels/:id` for findById/update/deactivate)
- `apps/api/test/levels-service.test.mjs` — 19 service tests
- `apps/api/test/levels-controller-wiring.test.mjs` — 4 controller-wiring tests

Modified
- `apps/api/src/configuration/configuration.module.ts` — registers `LevelsController` + `LevelsService`
