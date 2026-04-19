# Story 9.3: Pure scoring-core: calculateETA and calculateConfidence

Status: backlog

## Story

As a domain engineer,
I want pure ETA and Confidence functions,
so that the paired output is reproducible.

## Acceptance Criteria

1. `calculateETA(remainingPoints, approvedEvidence, now)` uses the 90-day velocity window; returns `null` when velocity is 0 (per PRD §7.6).
2. `calculateConfidence(historyDays, velocityCV, remainingMandatories, velocityTrendQoQ)` returns `High | Medium | Low` per PRD §7.7 and edge-case table §14.4.
3. Tests cover all scenarios in §14.4 including <30 days, stalled (velocity=0), declining >40% QoQ, and high-confidence path.

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

- PRD §7.6, §7.7, §14.4, FR-5.5, FR-5.6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
