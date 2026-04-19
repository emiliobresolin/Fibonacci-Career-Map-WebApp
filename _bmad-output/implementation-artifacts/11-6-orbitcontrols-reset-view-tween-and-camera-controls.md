# Story 11.6: OrbitControls, reset-view tween, and camera controls

Status: backlog

## Story

As a user,
I want to rotate, zoom, and reset the camera smoothly.

## Acceptance Criteria

1. `OrbitControls` (damped) wired; rotate via drag, zoom via wheel/pinch.
2. Reset-view control tweens the camera back to default orientation using drei camera animations.
3. Controls keyboard-dispatchable for users with pointer constraints (arrow-key rotate, +/- zoom).

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E11.4

### References

- PRD FR-2.7, FR-2.8, FR-2.11
- Arch §4.3 rule 9
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
