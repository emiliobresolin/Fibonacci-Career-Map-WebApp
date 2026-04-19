# Story 9.4: `score_snapshots` table, partitioning, and materialized `employee_current_snapshot` view

Status: backlog

## Story

As a platform engineer,
I want snapshots partitioned and the latest snapshot served via a materialized view,
so that reads are O(1) and writes remain append-only.

## Acceptance Criteria

1. Migration creates `score_snapshots` with columns listed in Arch §6.2; partitioned monthly by `RANGE (occurred_at)`; indexes `(employee_id, occurred_at DESC)` and `(organization_id, occurred_at)`.
2. Snapshot contains all five outputs atomically: `score`, `readiness_pct`, `promotion_eligible`, `eta_months`, `confidence`, plus `inputs_hash` and `triggering_event_id`.
3. Materialized view `employee_current_snapshot` refreshed within the same transaction via AFTER INSERT trigger.
4. Append-only enforcement: REVOKE UPDATE/DELETE on the role; trigger raises on any attempt.

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

- E1.4

### References

- Arch §6.3, §6.4
- PRD §7.9, FR-5.10
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
