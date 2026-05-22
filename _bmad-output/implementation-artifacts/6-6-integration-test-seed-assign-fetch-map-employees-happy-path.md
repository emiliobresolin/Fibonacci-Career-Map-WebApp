# Story 6.6: Integration test: seed → assign → fetch map employees happy path

Status: done

## Story

As a team,
I want a single end-to-end test that proves the bootstrap pipeline,
so that regressions show up early.

## Acceptance Criteria

1. Test provisions an org, seeds CDF, imports 5 employees via CSV, and calls `GET /v1/map/employees` (stub permitted until E10 lands).
2. Assertions confirm each employee appears with the expected `(track_id, level_id)` and no cross-org leakage.
3. Test runs in CI under `integration` suite.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E6.5

### References

- Epic E6 acceptance "integration test"
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References

- `pnpm test` → 308 pass / 3 skip / 0 fail (3rd skip = the new DATABASE_URL-gated suite)
- `pnpm --filter @fcm/api run build` → clean

### Completion Notes List

**Approach**: a single DATABASE_URL-gated integration test (matching the rls-integration + identity-integration suite pattern). The test walks:
1. `OrganizationsService.provision({slug, name})` → asserts PRD-mandated defaults
2. `SeedingService.seedOrganization(org.id)` → asserts CDF counts (3 tracks, 10 levels)
3. Synthetic ADMIN actor (inline create rather than via BootstrapService — the AC doesn't mandate the full bootstrap path, and narrower scope means a failure can be triaged faster)
4. 5-row CSV with one manager + four reports; `EmployeeImportService.commit`
5. Assertions: each employee has the right (track_id, level_id); manager_email resolves to the in-batch manager's employee.id; org B sees zero rows of org A's employees (RLS cross-tenant check)
6. Audit-trail pin: exactly 1 organization.created + 83 configuration.seeded + 5 employee.imported events landed in outbox

**The "stub for GET /v1/map/employees"**: until E10 lands the real endpoint, the test reads the employee + level + track data directly via the Prisma relation filter (`{ where: { user: { email: { in: [...] } } } }`). This covers the same assertions the future endpoint will surface.

### Adversarial Review Outcomes

Single-pass review found 1 BLOCKER + 1 HIGH + 1 MEDIUM:

- **BLOCKER**: initial slug format `_e6_a_<suffix>` violated `OrganizationsService`'s SLUG_RE (rejects underscores + leading non-alnum). **Fixed** by switching to `e6-a-<suffix>` with a hyphen-only format.
- **HIGH**: `Date.now().toString(36)` suffix could collide across parallel CI shards starting within the same second. **Fixed** by switching to `randomUUID().slice(0, 8)`.
- **MEDIUM**: teardown was unguarded; a partial failure could leak rows into subsequent runs. **Fixed** by wrapping each cleanup step in try/catch and guarding undefined references.

### Deferred to follow-up

- **F6-6a**: extend the test to call `BootstrapService.bootstrap` instead of the synthetic admin creation (would prove the full pipeline including 2-7 credentials + recovery codes).
- **F6-6b**: when GET /v1/map/employees lands (E10), replace the direct repo query with an HTTP request through supertest.

### File List

Added
- `apps/api/test/epic-6-happy-path-integration.test.mjs` — DATABASE_URL-gated suite
