# Story 12.2: Left Filters panel with tracks, levels, and session persistence

Status: backlog

## Story

As a user,
I want checkboxes for Career Tracks and Levels that filter the 3D scene with live employee counts.

## Acceptance Criteria

1. Left panel renders Career Track checkboxes with live counts, and Level (L1–L5) checkboxes for cross-track filtering.
2. Selecting filters immediately updates node visibility (faded-out not hidden, per PRD §5.1).
3. Selections persist in `sessionStorage` for the duration of the session.
4. Manager default filter is "My Team" (toggleable to org-wide).

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

- E12.1
- E10.2

### References

- PRD FR-2.12, FR-2.13, FR-2.15, §14.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
