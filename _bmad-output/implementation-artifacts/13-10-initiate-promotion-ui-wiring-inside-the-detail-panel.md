# Story 13.10: Initiate Promotion UI wiring inside the Detail Panel

Status: backlog

## Story

As a Manager,
I want the "Initiate Promotion" action to be enabled exactly when eligible, not in calibration mode, and not flagged, and to open a Performance Narrative composition modal.

## Acceptance Criteria

1. Button is enabled only when `promotion_eligible = true` AND `X-FCM-Rollout-Mode = ACTIVE` AND no open Calibration Flag for the employee.
2. Modal has a live character counter for the Performance Narrative; save-and-submit is disabled until ≥200 chars.
3. Successful submit calls `POST /v1/employees/:id/promotions` and updates panel state with a "Recommendation submitted" confirmation; client errors surface structured backend messages.
4. When suppressed by calibration, the button is replaced with the "Eligible — Pending Calibration" label and an explanatory tooltip.

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

- E12.6
- E13.4
- E12.9

### References

- PRD §6.5, §11.7, FR-3.11, FR-3.16, FR-7.3, FR-7.10
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
