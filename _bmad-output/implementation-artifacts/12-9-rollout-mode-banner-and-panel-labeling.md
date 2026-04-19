# Story 12.9: Rollout-Mode banner and panel labeling

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. When `X-FCM-Rollout-Mode = CALIBRATION`, a top-of-panel banner renders for Managers and HR: "Your organization is in calibration; promotion workflow is paused."
2. Employees do not see the operational banner but see the re-labeled Eligibility ("Eligible — Pending Calibration").
3. Banner state reacts live to `organization.promotion_mode.changed` realtime events.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E12.4
- E5.5
- E10.4

### References

- PRD FR-3.16, §8.9
- Arch §13.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
