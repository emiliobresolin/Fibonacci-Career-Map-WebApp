# Story 12.1: Top navigation bar and persistent canvas

Status: backlog

## Story

As a user,
I want top-nav entries "Career Map / Dashboard / Analytics / Settings" with Career Map as the default landing and a canvas that persists across routes.

## Acceptance Criteria

1. Top-nav entries render with correct active-route highlighting; Career Map is default post-login.
2. Navigating to `/dashboard`, `/analytics`, `/settings` keeps the 3D canvas in memory (regenerates only on config change per E11.2).
3. Role-gated: non-Admins do not see Settings.
4. Keyboard navigation works across all nav entries.

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

- E11.1

### References

- PRD §5.3, FR-2.1
- Arch §4.2, §4.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
