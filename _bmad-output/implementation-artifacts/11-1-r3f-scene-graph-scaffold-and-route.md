# Story 11.1: R3F scene graph scaffold and route

Status: backlog

## Story

As a frontend developer,
I want a React Three Fiber scene rendering a placeholder spiral at `/map`,
so that later stories hang nodes off a real canvas.

## Acceptance Criteria

1. `/map` route loads a client component mounting an R3F `<Canvas>` in dark mode.
2. Placeholder spiral geometry renders at 60 fps on a reference desktop.
3. Layout uses a persistent canvas pattern (the canvas remains mounted when the user navigates to other routes per Arch §4.4).

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E1.3
- E10.1

### References

- Arch §4.3, §4.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
