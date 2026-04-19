# Story 12.10: Accessible List View toggle and aria-label canvas summary

Status: backlog

## Story

As a user who cannot operate the 3D canvas,
I want an accessible list equivalent,
so that I can still navigate.

## Acceptance Criteria

1. A toggle next to the canvas swaps the 3D scene for a screen-reader-friendly table using the same `/map/employees` data feed.
2. Table rows are keyboard-focusable; pressing Enter opens the same detail panel.
3. `aria-label` on the canvas summarizes the visible cohort (e.g., "3D Career Map showing 47 employees across 3 tracks").

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E12.2
- E12.4

### References

- PRD NFR-10.4, NFR-10.5
- Arch §4.6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
