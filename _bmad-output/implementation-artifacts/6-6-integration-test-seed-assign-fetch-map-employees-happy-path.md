# Story 6.6: Integration test: seed → assign → fetch map employees happy path

Status: backlog

## Story

As a team,
I want a single end-to-end test that proves the bootstrap pipeline,
so that regressions show up early.

## Acceptance Criteria

1. Test provisions an org, seeds CDF, imports 5 employees via CSV, and calls `GET /v1/map/employees` (stub permitted until E10 lands).
2. Assertions confirm each employee appears with the expected `(track_id, level_id)` and no cross-org leakage.
3. Test runs in CI under `integration` suite.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E6.5

### References

- Epic E6 acceptance "integration test"
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
