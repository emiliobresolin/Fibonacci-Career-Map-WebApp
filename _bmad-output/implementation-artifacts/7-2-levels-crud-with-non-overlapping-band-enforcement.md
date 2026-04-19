# Story 7.2: Levels CRUD with non-overlapping band enforcement

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `GET/POST/PATCH /v1/levels[/:id]`; ADMIN-only.
2. Band overlap is rejected at the DB layer (exclusion constraint from E6.2) and surfaced as a structured `409 LEVEL_BAND_OVERLAP` error with the conflicting level's id.
3. Mutation emits an audit event.
4. Integration test covers a valid create, an overlapping reject, and a gap-tolerant update.

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

- E7.1

### References

- PRD FR-6.2
- Arch §6.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
