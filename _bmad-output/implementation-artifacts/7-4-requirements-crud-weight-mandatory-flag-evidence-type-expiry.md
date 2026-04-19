# Story 7.4: Requirements CRUD (weight, mandatory flag, evidence type, expiry)

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. CRUD endpoints implemented; ADMIN-only.
2. Fields: `name`, `description`, `evidence_type enum(FILE|URL|TEXT|STRUCTURED)`, `weight INT > 0`, `mandatory BOOL`, `expiry_months INT nullable`.
3. Mutation emits audit event.
4. A requirement cannot be hard-deleted once referenced by any evidence record; soft-deactivate instead.

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

- E7.3

### References

- PRD FR-6.4, §8.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
