# Story 9.1: Pure scoring-core package: calculateScore

Status: backlog

## Story

As a domain engineer,
I want a pure `calculateScore` function with zero I/O,
so that determinism is testable in isolation.

## Acceptance Criteria

1. `packages/scoring-core/src/calculateScore.ts` exports `calculateScore(inputs: ApprovedEvidence[], currentLevelId: string, now: Date): number`.
2. Sums weights of APPROVED evidence scoped to `currentLevelId` per PRD §7.2.
3. Pure function: no imports from `apps/api`, no clock, no DB.
4. Unit tests cover 1k+ randomized permutations with snapshot-level determinism assertion.

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

- E1.1

### References

- PRD §7.2, FR-5.1, FR-5.8
- Arch §5.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
