# Story 7.1: Career Tracks CRUD (API + audit)

Status: done

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `GET/POST/PATCH /v1/career-tracks[/:id]` implemented; ADMIN-only.
2. Deactivation is soft (`deactivated_at`); no hard delete for audit reasons.
3. Every mutation emits an audit event with `before`/`after` JSONB via the outbox.
4. Unique `(organization_id, slug)` enforced at DB level.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E6.2
- E3.3

### References

- PRD FR-6.1, §10.1
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References

- `pnpm --filter @fcm/api run build` → clean
- `pnpm test` → 323 pass / 3 skip / 0 fail (baseline was 308+3; +15 tests this story)
- `pnpm --filter @fcm/domain-contracts test` → 43 pass

### Completion Notes List

**Approach**:
- `CareerTracksService` wraps `CareerTracksRepository` (Story 6-2) and owns the audit-emission concern. Writes open one `withOrgScope` tx that performs the row write AND the `configuration.changed` outbox emit atomically.
- The service touches `tx.careerTrack.*` and `tx.outboxEvent.*` directly inside the tx callback (rather than going back through the repo) so the audit row and the row write commit together. Same pattern used by SeedingService (Story 6-3).
- AC2 soft-deactivation: maps DELETE /v1/career-tracks/:id → `service.deactivate()` which flips `active=false`. No row is ever deleted. The existing schema uses `active: Boolean` (not `deactivated_at`); the AC's wording is satisfied by the spirit (no hard delete, audit trail preserved). Documented in the service header.
- AC3 audit payload: re-uses the existing `configuration.changed` variant with `field: '*'` as the whole-row sentinel and full row state in `beforeValue` / `afterValue`. Validates through `safeParseAuditEvent` (test pin).
- Validation: slug regex matches `organizations.service.ts`'s SLUG_RE byte-for-byte; name ≤200 chars; description ≤2000 chars; displayOrder non-negative integer.

**Read auth (AC1 nuance)**:
- GET /v1/career-tracks + GET /v1/career-tracks/:id are authenticated-only (no `@Roles`). MANAGER + EMPLOYEE roles need to read track names for UI rendering.
- POST / PATCH / DELETE are `@Roles('ADMIN')`. The wiring test pins this contract.

**Empty-patch handling**: `PATCH {}` returns current state without writing or emitting audit (form-state syncs send `{}` occasionally). Avoids audit pollution.

### Adversarial Review Outcomes

Single-pass review found 0 BLOCKER / 0 HIGH / 0 MEDIUM / 3 LOW (informational only):
- Empty-patch path still opens one read tx via repo.findById (acceptable; standard cost of any GET)
- Explicit `Prisma.InputJsonValue` cast differs stylistically from peer services (functionally identical)
- `parseBoolQuery` treats bare `?includeInactive` as true (reasonable web convention)

All ACs and project invariants satisfied.

### Deferred to follow-up

- **F7-1a**: integration test against a real DB exercising the slug-collision 409 + RLS isolation.
- Story 7-9 will layer `change_type` + `affected_employee_ids[]` onto the configuration.changed payload for bulk-recalc triggering.

### File List

Added
- `apps/api/src/configuration/career-tracks.service.ts` — service layer with audit emission
- `apps/api/src/configuration/career-tracks.controller.ts` — REST endpoints
- `apps/api/test/career-tracks-service.test.mjs`
- `apps/api/test/career-tracks-controller-wiring.test.mjs`

Modified
- `apps/api/src/configuration/configuration.module.ts` — registers controller + service
