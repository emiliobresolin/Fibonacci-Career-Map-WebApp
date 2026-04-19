# Story 12.3: Hover tooltip (name, level, track)

Status: backlog

## Story

As a user,
I want a lightweight hover tooltip,
so that I can identify a node without clicking.

## Acceptance Criteria

1. Hovering a node shows a tooltip with `name`, `level`, `track`; throttled 60 Hz.
2. Tooltip suppressed for anonymized nodes.
3. Tooltip respects visibility: peer-not-visible nodes receive no tooltip.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E11.5
- E10.3

### References

- PRD FR-2.10
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
