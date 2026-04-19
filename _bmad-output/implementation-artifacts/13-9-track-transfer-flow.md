# Story 13.9: Track Transfer flow

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `POST /v1/employees/:id/track-transfers` (ADMIN only) accepts `to_track_id`, `target_level_id`, `reason` ≥40 chars.
2. In one transaction: inserts `track_transfers` row, updates employee's `track_id` and `level_id`, resets score for the new track to 0, preserves all prior evidence and snapshots in audit history.
3. Admin may optionally carry over specific evidence via a separate endpoint `PATCH /v1/evidence/:id/reassociate-to-track` (logged as manual re-association).
4. Notification to employee and manager.

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

- E13.8
- E8.1

### References

- PRD §14.6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
