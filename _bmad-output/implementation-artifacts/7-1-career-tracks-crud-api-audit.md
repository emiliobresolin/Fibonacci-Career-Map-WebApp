# Story 7.1: Career Tracks CRUD (API + audit)

Status: backlog

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

### Debug Log References

### Completion Notes List

### File List
