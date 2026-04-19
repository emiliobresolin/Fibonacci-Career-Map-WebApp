# Story 13.1: `promotion_records` table and approval-chain state machine

Status: backlog

## Story

As a platform engineer,
I want a promotion records table with a strict state machine,
so that every step is auditable.

## Acceptance Criteria

1. Migration creates `promotion_records(id, organization_id, employee_id, from_level_id, to_level_id, state enum, initiated_at, completed_at)` with state transitions: `RECOMMENDED → IN_REVIEW → APPROVED | REJECTED | CALIBRATION_HOLD`; `CALIBRATION_HOLD → IN_REVIEW | REJECTED`.
2. Domain-layer state machine rejects illegal transitions.
3. Append-only for terminal states.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E6.2
- E2.6

### References

- Arch §6.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
