# Story 4.3: Idempotency registry `recalc_jobs`

Status: backlog

## Story

As a system,
I want per-`(employee_id, triggering_event_id)` idempotency,
so that duplicate recalcs never produce duplicate snapshots.

## Acceptance Criteria

1. Migration creates `recalc_jobs(employee_id, triggering_event_id, status enum('pending'|'completed'|'failed'), created_at, completed_at)` with a unique constraint on the pair.
2. A helper `claim(employee_id, triggering_event_id)` performs `SELECT ... FOR UPDATE`, inserts if absent, aborts with `AlreadyCompletedError` if the row is already `completed`.
3. Unit tests cover first-time claim, concurrent-claim race, and already-completed abort.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E4.1
- E1.4

### References

- Arch §7.3
- FR-5.9
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
