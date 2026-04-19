# Story 9.6: Bulk recalculation consumer (`scoring.recalc-org-bulk`)

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. Consumer of `scoring.recalc-org-bulk` fans out per-employee jobs sharing the same `triggering_event_id` onto `scoring.recalc-employee`.
2. Queue is rate-limited per Arch §7.2 so bulk never starves interactive recalcs.
3. Progress events `recalc.bulk.progress { completed, total }` emitted via outbox for the admin UI.
4. Integration test with 50 synthetic employees asserts all complete and a progress event stream is observable.

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

- E9.5
- E7.9

### References

- Arch §7.4
- PRD FR-6.9
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
