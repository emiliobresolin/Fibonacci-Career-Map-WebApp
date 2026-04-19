# Story 15.5: HR Calibration Queue (2D)

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `/analytics/calibration-queue` (HR only) lists: Eligible without recommendation; Recommended awaiting approval; Currently flagged; Recently promoted (last 30 days).
2. Each row exposes eligibility date, manager, track, level transition, recommendation-narrative excerpt.
3. One-click actions: open Detail Panel; open Calibration Flag resolution modal (from E13.6).
4. Filterable by track, team, manager, level transition.

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
- E13.4
- E13.6

### References

- PRD FR-10.5, §6.8
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
