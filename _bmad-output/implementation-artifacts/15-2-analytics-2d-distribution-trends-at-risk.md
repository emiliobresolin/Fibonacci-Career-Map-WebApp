# Story 15.2: Analytics (2D): distribution, trends, at-risk

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `/analytics` renders: distribution by `(track, level)`; velocity and readiness trends over time; promotion-ready / stalled / at-risk lists.
2. Scope respects role: Managers see team-scoped; Admin sees org.
3. Charts keyboard-navigable; tabular alternative available.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E9.4

### References

- PRD FR-10.1–10.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
