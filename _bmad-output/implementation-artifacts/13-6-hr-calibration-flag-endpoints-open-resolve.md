# Story 13.6: HR calibration-flag endpoints (open, resolve)

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `POST /v1/employees/:id/calibration-flags` (HR only): opens a flag with `reason` ≥40 chars; blocks any in-progress promotion from advancing.
2. `PATCH /v1/calibration-flags/:id/resolve` (HR only): transitions to `RESOLVED_RELEASE` (lifts the hold; workflow can resume via E13.5 if required) or `RESOLVED_REJECT` (persists as organizational context; does not lift the underlying eligibility computation).
3. Both actions emit audit + notification events.
4. Integration test asserts approval endpoints return `CALIBRATION_FLAG_OPEN` while a flag is open.

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

- E13.3

### References

- PRD FR-3.15, FR-7.12, §6.8
- Arch §5.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
