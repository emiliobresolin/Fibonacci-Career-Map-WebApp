# Story 8.3: Pre-signed retrieval with RBAC + visibility checks

Status: backlog

## Story

As a reviewer,
I want to download an evidence file only after an authorization pass.

## Acceptance Criteria

1. `GET /v1/evidence/:id/download` returns a 10-min TTL pre-signed GET URL only after RBAC + visibility checks pass; else 403.
2. Downloads by the Employee themselves, their direct manager, or an Admin succeed; unrelated viewers are rejected.
3. A `403` on cross-org access is asserted in an integration test (RLS + explicit check).
4. Each successful retrieval emits an `evidence.retrieved` audit event.

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

- E8.2

### References

- Arch §9.2, AR-5
- PRD FR-4.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
