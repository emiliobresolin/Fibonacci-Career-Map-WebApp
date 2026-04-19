# Story 8.6: Retroactive rejection of APPROVED evidence

Status: backlog

## Story

As a Manager or Admin,
I want to retroactively reject previously approved evidence.

## Acceptance Criteria

1. `PATCH /v1/evidence/:id/reject` accepts reject against an APPROVED evidence item; state transitions APPROVED → REJECTED.
2. A recalc job enqueues for the affected employee with a synthetic `EvidenceRetroactivelyRejected` triggering event.
3. The audit event flags `retroactive: true` and includes `approved_at` and `rejected_at` for date-discrepancy investigation.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E8.4

### References

- PRD FR-4.7
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
