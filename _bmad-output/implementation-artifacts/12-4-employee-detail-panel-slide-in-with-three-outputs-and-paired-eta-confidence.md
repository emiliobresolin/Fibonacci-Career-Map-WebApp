# Story 12.4: Employee Detail Panel slide-in with three outputs and paired ETA+Confidence

Status: backlog

## Story

As a user,
I want the detail panel to slide in from the right when I click a node, showing Score Progress, Readiness %, and Promotion Eligibility as three visually distinct outputs plus a paired ETA + Confidence.

## Acceptance Criteria

1. Panel slides in from the right; 3D canvas remains visible and rotatable behind it (FR-3.2).
2. Panel shows photo, name, track, current level.
3. Three outputs clearly separated: Score Progress (points + % of band), Readiness % (distinct component), Promotion Eligibility (state label `ELIGIBLE` / `NOT_ELIGIBLE` / `CALIBRATION_HOLD` / `PENDING_CALIBRATION` with reasons).
4. ETA + Confidence displayed as a paired output with Confidence as a visual badge.
5. Closing the panel deselects the node and returns to the 3D canvas.

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

- E11.5
- E9.8

### References

- PRD §5.2, FR-3.1, FR-3.6, FR-3.7, FR-3.13
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
