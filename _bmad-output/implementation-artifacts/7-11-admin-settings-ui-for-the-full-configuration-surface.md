# Story 7.11: Admin Settings UI for the full configuration surface

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `/settings` routes render forms for Tracks, Levels, Layers, Requirements, Promotion Rules, Visibility, Approval Workflow, and Rollout Mode.
2. Change-impact preview (E7.8) displays before save; save is disabled until preview runs.
3. All forms are keyboard-navigable (NFR-10.4) and screen-reader labeled (NFR-10.5).
4. Admin-only; redirect non-Admins to `/map`.

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

- E7.1–E7.10

### References

- PRD FR-6.1–6.10
- Arch §4.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
