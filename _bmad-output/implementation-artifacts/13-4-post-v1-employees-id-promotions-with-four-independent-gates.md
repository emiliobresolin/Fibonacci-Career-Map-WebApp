# Story 13.4: `POST /v1/employees/:id/promotions` with four independent gates

Status: backlog

## Story

As a Manager,
I want to initiate a promotion knowing the server enforces Eligibility, Rollout Mode, Calibration Flag absence, and Performance Narrative presence.

## Acceptance Criteria

1. Endpoint re-verifies, in a single transaction: (a) `promotion_eligible = true` on the latest snapshot; (b) `organization.promotion_mode = ACTIVE`; (c) no open `calibration_flags` for the employee; (d) `performance_narrative` ≥200 chars in the body.
2. Structured error codes on rejection: `PROMOTION_NOT_ELIGIBLE` (+ failing_condition), `ORG_IN_CALIBRATION_MODE`, `CALIBRATION_FLAG_OPEN` (+ flag_id), `NARRATIVE_TOO_SHORT`.
3. On success, inserts `promotion_records` (state `RECOMMENDED`), inserts `promotion_recommendations` (append-only), emits outbox events (audit + notification + manager-team realtime).

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E13.1
- E13.2
- E13.3
- E7.10
- E9.5

### References

- PRD FR-7.3, FR-7.4, FR-7.10, FR-7.12, FR-7.13, §6.5
- Arch §5.4, AR-12
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
