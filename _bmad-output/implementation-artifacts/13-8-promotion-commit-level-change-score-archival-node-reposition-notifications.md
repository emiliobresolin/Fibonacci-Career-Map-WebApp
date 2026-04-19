# Story 13.8: Promotion commit: level change, score archival, node reposition, notifications

Status: backlog

## Story

As a system,
I want a completed promotion to atomically commit the level change and fan out.

## Acceptance Criteria

1. On final approval, a single transaction: updates `employees.level_id`, resets level-scoped score inputs (next recalc will compute against new level), archives previous snapshot via a `promotion.committed` triggering event, inserts outbox rows for audit + notification + realtime `promotion.completed`.
2. `promotion.completed` event triggers a 3D canvas node-reposition animation client-side.
3. Previous-level score remains in `score_snapshots` history.
4. Integration test covers the full initiate → approve → commit → node-reposition path.

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

- E13.7
- E9.5
- E5.4

### References

- PRD FR-7.7, FR-7.8, FR-7.9, §6.5
- Arch §5.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
