# Story 13.5: HR calibration-flag endpoints (open, resolve)

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `POST /v1/employees/:id/calibration-flags` (ADMIN role, treated as HR per PRD §4.2): opens a flag with `reason` ≥40 chars (matches DB CHECK on `calibration_flags.open_reason`); blocks any in-progress promotion from advancing.
2. `PATCH /v1/calibration-flags/:id/resolve` (ADMIN role): transitions to `RESOLVED_RELEASE` (lifts the hold; workflow resumes via the re-recommend transition in E13.6) or `RESOLVED_REJECT` (persists as organizational context; does not lift the underlying eligibility computation).
3. Concurrent-flag race: the partial unique index on `calibration_flags(employee_id) WHERE state='OPEN'` is the canonical race resolver — two concurrent HR opens result in exactly one OPEN row; the loser receives `409 CALIBRATION_FLAG_ALREADY_OPEN` with the existing flag id.
4. Both actions emit audit + notification events via outbox.
5. Integration test asserts approval endpoints return `CALIBRATION_FLAG_OPEN` while a flag is open.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4
- [ ] Task covering AC #5

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E13.3
- E2.5
- E2.6
- E3.3

### References

- PRD FR-3.15, FR-7.12, §6.8
- Arch §5.4, §6.2 (`calibration_flags`)
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
