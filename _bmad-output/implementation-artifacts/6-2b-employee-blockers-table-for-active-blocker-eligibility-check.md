# Story 6.2b: employee_blockers table for active-blocker eligibility check

Status: done (AC4 eligibility-flip integration test deferred — Epic 9 owns the evaluator)

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. Migration creates `employee_blockers(id UUID PK, organization_id UUID FK, employee_id UUID FK, kind blocker_kind_enum('PIP','PERFORMANCE_CONCERN','HR_HOLD','OTHER'), reason TEXT NOT NULL CHECK (char_length(reason) >= 20), opened_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ NULL, opened_by UUID FK, resolved_by UUID FK NULL)` with RLS and partial unique index `(employee_id, kind) WHERE resolved_at IS NULL`.
2. Admin/HR-only API: `POST /v1/employees/:id/blockers` and `PATCH /v1/blockers/:id/resolve`; non-Admin returns 403.
3. Every open/resolve action emits an audit event via outbox.
4. Integration test: opening a blocker flips Eligibility to `NOT_ELIGIBLE` on the next recalc; resolving restores it.

## Tasks / Subtasks

- [x] Task covering AC #1 — migration `20260530000000_employee_blockers/migration.sql` creates the table + `BlockerKind` enum (PIP/PERFORMANCE_CONCERN/HR_HOLD/OTHER) + reason ≥20 CHECK + resolved_at/resolved_by consistency CHECK + opened_by/resolved_by FK to users (RESTRICT — a deleted user shouldn't silently strip attribution) + PARTIAL UNIQUE `(employee_id, kind) WHERE resolved_at IS NULL` + a partial index on the active rows so the Epic-9 eligibility evaluator's EXISTS read is constant-time + RLS sweep with closed-fail predicate.
- [x] Task covering AC #2 — `BlockersController` exposes `POST /v1/employees/:employeeId/blockers` and `PATCH /v1/blockers/:id/resolve`, both `@Roles('ADMIN')`. PRD §8.5 says "Admin/HR" but FCM's role enum is EMPLOYEE/MANAGER/ADMIN — HR is conceptually a sub-role of ADMIN in MVP; a future HR carve-out can widen the gate without breaking the API. Validation: UUID pattern, BlockerKind enum, reason 20–4000 chars (after trim), optional resolutionNote ≤4000 chars. Cross-org probes blocked: the open path does an employee lookup inside withOrgScope (404 "Unknown employee"); the resolve path's updateMany WHERE id AND resolved_at IS NULL inside withOrgScope surfaces a cross-org id as the SAME 409 message as a legitimately-already-resolved blocker, so no message diff lets an admin probe.
- [x] Task covering AC #3 — `BlockersRepository.open()` and `resolve()` each commit the DB write and the outbox `blocker.opened` / `blocker.resolved` event in the same `withOrgScope` transaction. The AuditEvent taxonomy in `@fcm/domain-contracts` was extended with the two new variants; the repo tests reconstruct the relay's merge candidate and pin that `safeParseAuditEvent` accepts the payload (so the relay won't DLQ on Story 3-3's validation gate).
- [x] Task covering AC #4 — the canonical eligibility read primitive `BlockersRepository.hasActiveBlocker(orgId, employeeId)` is shipped and unit-tested via capturing fake (returns boolean, never the row, so a visibility-sensitive surface can't accidentally leak the blocker's reason). The live-DB "open flips Eligibility to NOT_ELIGIBLE, resolve restores it" assertion is deferred to Epic 9 (the evaluator hasn't shipped yet) — see the Deferred section.

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E6.2a
- E3.3

### References

- PRD §7.5 condition 4, §8.5
- Arch §6.2 (`employee_blockers`)
- [Source: planning-artifacts/stories.md — index entry for this story]

### Deferred to follow-up

- **AC4 live-DB eligibility-flip assertion.** The eligibility evaluator is Epic 9 — when its `evaluateEligibility(employeeId)` lands, an integration test should exercise `open → evaluate (NOT_ELIGIBLE) → resolve → evaluate (ELIGIBLE-ish)`. The primitive `hasActiveBlocker` is shipped and unit-pinned; Epic 9 will be the first consumer.
- **Optional DATABASE_URL-gated suite for the open/resolve/hasActiveBlocker round-trip.** A small additional integration test could exercise `BlockersRepository.open() → hasActiveBlocker=true → resolve() → hasActiveBlocker=false` against a live PG to confirm the PARTIAL unique index + the active-employee partial index behave as designed. Worth adding when the broader CI integration-suite job materializes.
- **HR carve-out from ADMIN.** PRD §8.5 names "Admin/HR" but FCM's role enum is EMPLOYEE/MANAGER/ADMIN. A future story that splits HR from ADMIN should update both this controller's `@Roles` and the audit-read RBAC scope in Story 3-5.
- **HTTP idempotency keys on open/resolve.** A client retry after a network timeout could currently observe a 409 from a successful first attempt. Not a correctness bug — the conflict is real from the DB's perspective — but a future hardening pass could accept an `Idempotency-Key` header and short-circuit.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m])

### Debug Log References

- `pnpm --filter @fcm/domain-contracts run build` — green (new schema variants compile).
- `pnpm --filter @fcm/api exec prisma generate` — green; client regenerated with BlockerKind + EmployeeBlocker model.
- `pnpm --filter @fcm/api run build` — green.
- `pnpm test` — 240 pass + 2 skip (apps/api) + 43 pass (domain-contracts). 30 new tests over the 6-2a baseline of 210 + 2 skip = (9 migration-shape + 10 repo + 13 controller — note the actual numbers verified by the adversarial reviewer).
- Adversarial review (general-purpose subagent) — 0 BLOCKER, 0 HIGH. Reviewer verified the double-resolve race semantics (PG row lock + RC re-evaluation + Prisma single-transaction atomicity), the cross-org probe blocking on both endpoints, the audit-taxonomy round-trip via reconstructed relay candidate, and the partial unique index correctness against the role_assignments precedent.

### Completion Notes List

- AC1: `employee_blockers` table with all the AC-mandated columns + the BlockerKind enum + the reason ≥20 CHECK + resolved_at/by consistency CHECK + PARTIAL unique + RLS sweep. A partial index on `(employee_id) WHERE resolved_at IS NULL` keeps the eligibility-evaluator EXISTS read constant-time.
- AC2: `BlockersController` with `@Roles('ADMIN')` on both endpoints. Validation covers UUID shape, enum membership, reason length (after trim), optional resolutionNote length. Cross-org probe blocked: 404 / 409 messages are uniform across the legitimate-error and cross-org-id cases.
- AC3: outbox emission paired with the DB write in one `withOrgScope` transaction. `blocker.opened` and `blocker.resolved` added to the AuditEvent taxonomy; repo tests reconstruct the relay's merge candidate and pin `safeParseAuditEvent` acceptance.
- AC4: `hasActiveBlocker(orgId, employeeId)` returns boolean and is the canonical primitive Epic 9's eligibility evaluator will read. Live-DB eligibility-flip integration test deferred (see above).
- Race correctness: `resolve()` uses `updateMany WHERE id AND resolved_at IS NULL` then re-reads inside the same transaction. Two concurrent resolvers serialize via Postgres row-level write lock under READ COMMITTED; the loser sees count=0 and throws `BlockerAlreadyResolvedError`. The outbox row only commits on the winning path.

### File List

- `apps/api/prisma/schema.prisma` (modified) — added `BlockerKind` enum + `EmployeeBlocker` model; back-relations from Organization and Employee.
- `apps/api/prisma/migrations/20260530000000_employee_blockers/migration.sql` (new) — full table + enum + PARTIAL unique + partial index + reason ≥20 CHECK + resolved consistency CHECK + RLS sweep.
- `packages/domain-contracts/src/events/audit.ts` (modified) — added `BlockerOpenedSchema` + `BlockerResolvedSchema`, exported types, `AUDIT_EVENT_TYPES` bumped to 15.
- `packages/domain-contracts/src/events/audit.test.ts` (modified) — added SAMPLES for the two new variants, count assertion bumped to 15.
- `apps/api/src/identity/blockers.repository.ts` (new) — `findById`, `listForEmployee`, `hasActiveBlocker`, `open` (DB + outbox), `resolve` (conditional updateMany + DB + outbox), `BlockerAlreadyResolvedError`, `isDuplicateActiveBlockerError` helper.
- `apps/api/src/identity/blockers.controller.ts` (new) — Admin-only `POST /v1/employees/:employeeId/blockers` + `PATCH /v1/blockers/:id/resolve`.
- `apps/api/src/identity/identity.module.ts` (modified) — registers `BlockersController` + `BlockersRepository`; exports `BlockersRepository`.
- `apps/api/test/blockers-migration-shape.test.mjs` (new) — 9 SQL-shape tests pinning the AC1 invariants.
- `apps/api/test/blockers-repository.test.mjs` (new) — 10 tests: withOrgScope wiring, outbox emission, AuditEvent taxonomy round-trip, conditional updateMany behavior, `BlockerAlreadyResolvedError` on zero-match.
- `apps/api/test/blockers-controller.test.mjs` (new) — 13 tests: input validation (UUID/enum/length), cross-org 404, P2002→409, BlockerAlreadyResolvedError→409, resolve happy path with and without note.

### Adversarial Review Outcomes

- Double-resolve race: verified PG row-lock + READ COMMITTED re-evaluation + Prisma single-transaction atomicity guarantee that exactly one resolver wins and only the winning transaction emits the outbox row. The defensive `findUnique` between updateMany and outbox.create has no race window because both run in the same tx.
- Cross-org probing: both endpoints surface the SAME error shape for "exists in another org" as "legitimately bad input" (404 "Unknown employee" / 409 "already resolved or does not exist"). No information leak.
- AuditEvent round-trip: the test reconstructs the relay's exact merge candidate (`{outbox structural fields} + {payload spread}`) — spread order is correct so `actorId: null` is overridden by the payload's actorId, matching the relay's behavior verbatim.
- Reason/resolutionNote validation drift: controller (20–4000 after trim) + DB CHECK (≥20) + audit schema (≥20 for opened, nullable for resolved) — three sources of truth, all consistent; the taxonomy test exercises the schema bound.
- 0 BLOCKER / 0 HIGH findings. Minor non-blocking notes: a couple of trivial controller branches not directly exercised (non-string reason type → falls through to length-0 check; explicit `null` resolutionNote → trivial pass), HTTP idempotency-key support is a future hardening item.
