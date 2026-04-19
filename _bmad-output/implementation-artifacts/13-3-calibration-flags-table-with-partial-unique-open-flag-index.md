# Story 13.3: `calibration_flags` table with partial unique open-flag index

Status: backlog

## Story

As a platform engineer,
I want calibration flags with a DB-level guarantee of at most one open flag per employee.

## Acceptance Criteria

1. Migration creates `calibration_flags(id, organization_id, employee_id, flagger_id, state enum('OPEN','RESOLVED_RELEASE','RESOLVED_REJECT'), open_reason TEXT NOT NULL CHECK (char_length(open_reason) >= 40), resolution_note TEXT nullable, opened_at, resolved_at)`.
2. Partial unique index on `(employee_id) WHERE state = 'OPEN'` enforces the single-open-flag invariant.
3. A 409 `CALIBRATION_FLAG_ALREADY_OPEN` structured error is returned on concurrent open-flag conflict.

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

### References

- PRD FR-3.15, FR-7.12, §6.8
- Arch §5.4, §6.2, AR-14
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
