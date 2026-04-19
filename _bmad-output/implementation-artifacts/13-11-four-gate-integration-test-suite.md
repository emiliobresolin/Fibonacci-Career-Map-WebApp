# Story 13.11: Four-gate integration test suite

Status: backlog

## Story

As a team,
I want automated proof that all four independent gates block promotion paths.

## Acceptance Criteria

1. Test (a): high Readiness %, low Eligibility employee — request rejected `PROMOTION_NOT_ELIGIBLE`.
2. Test (b): eligible employee in `CALIBRATION`-mode org — rejected `ORG_IN_CALIBRATION_MODE`.
3. Test (c): eligible employee with open Calibration Flag — rejected `CALIBRATION_FLAG_OPEN` with flag_id.
4. Test (d): eligible employee with missing/<200-char narrative — rejected `NARRATIVE_TOO_SHORT`.
5. Each test asserts an audit event captures the rejection itself.

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

- E13.4

### References

- Epic E13 acceptance
- PRD §19.1 item 11, FR-7.4, FR-7.10, FR-7.12, FR-7.13
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
