# Story 9.7: Score Breakdown explainability API

Status: backlog

## Story

As an Employee or Manager,
I want to see exactly which evidence contributed to the current score.

## Acceptance Criteria

1. `GET /v1/employees/:id/score-breakdown` returns `{ snapshot_id, contributing_evidence: [{ evidence_id, requirement_id, weight, approved_at, approver_id, approver_reason }], total_score }`.
2. Derived from the latest snapshot + joins; no recomputation.
3. RBAC: self, direct manager, or Admin; else 403. Visibility rules for peers apply.
4. Integration test asserts the breakdown sums exactly to the snapshot's `score`.

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

- E9.5

### References

- PRD §10.3
- Arch §9.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
