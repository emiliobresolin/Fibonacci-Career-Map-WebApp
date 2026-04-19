# Story 16.4: Load test suite (500-node 3D FPS, recalc storm, WS fanout)

Status: backlog

## Story

As a team,
I want automated load tests,
so that regressions are visible before production.

## Acceptance Criteria

1. A 500-node 3D FPS test exercises `/map` against a seeded 500-employee org and asserts ≥30 fps sustained.
2. A recalc-storm test triggers a configuration change against a 10k-employee synthetic org and asserts bulk queue does not starve the interactive queue (interactive p95 < 30 s throughout).
3. A WS fanout test holds 2000 sustained clients and measures disconnect rate < 5%.
4. Tests are idempotent and runnable in staging; documented in `docs/ops/load-tests.md`.

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

- E9.6
- E11.4
- E5.1

### References

- Arch §16 T-load-test
- NFR-1.1, NFR-1.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
