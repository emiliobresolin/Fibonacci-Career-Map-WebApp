# Story 13.9: Track Transfer flow

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. Migration creates `track_transfers(id UUID PK, organization_id UUID FK, employee_id UUID FK, from_track_id UUID FK, to_track_id UUID FK, from_level_id UUID FK, to_level_id UUID FK, reason TEXT NOT NULL CHECK (char_length(reason) >= 40), transferred_by UUID FK, transferred_at TIMESTAMPTZ NOT NULL)` with RLS, append-only.
2. `POST /v1/employees/:id/track-transfers` (ADMIN only) accepts `to_track_id`, `target_level_id`, `reason` ≥40 chars; rejected with `PROMOTION_IN_FLIGHT` if the employee has a `promotion_records` row in any non-terminal state (`RECOMMENDED` / `IN_REVIEW` / `CALIBRATION_HOLD`).
3. In one transaction: inserts `track_transfers` row, updates employee's `track_id` and `level_id`, resets score for the new track to 0, preserves all prior evidence and snapshots in audit history.
4. Admin may optionally carry over specific evidence via a separate endpoint `PATCH /v1/evidence/:id/reassociate-to-track` (logged as manual re-association).
5. Notification to employee and manager.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4
- [ ] Task covering AC #5

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E6.2a
- E13.8
- E8.1
- E2.5
- E2.6
- E3.3

### References

- PRD §14.6
- Arch §6.2 (`track_transfers`), §5.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
