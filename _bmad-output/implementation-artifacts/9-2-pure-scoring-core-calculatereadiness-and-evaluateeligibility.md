# Story 9.2: Pure scoring-core: calculateReadiness and evaluateEligibility

Status: backlog

## Story

As a domain engineer,
I want pure readiness % and eligibility functions,
so that the three outputs remain distinct in code.

## Acceptance Criteria

1. `calculateReadiness(score, bandStart, bandEnd, mandatoryCompleted, mandatoryTotal)` returns 0–100 per PRD §7.4.
2. `evaluateEligibility(score, bandEnd, mandatories[], minTimeAtLevelMonths, timeAtLevelMonths, blockers[])` returns `{ eligible: boolean, failing_conditions: string[] }` per PRD §7.5.
3. Unit tests cover each failing-condition path plus the fully-eligible case; assert that a 99% readiness does not imply `eligible = true`.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E9.1

### References

- PRD §7.4, §7.5, FR-5.2, FR-5.3, FR-5.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
