# Story 8.4: Approve/Reject with mandatory reasons and ApprovalRecord

Status: backlog

## Story

As a Manager,
I want to approve or reject evidence with a written reason.

## Acceptance Criteria

1. `PATCH /v1/evidence/:id/approve` requires `reason` ≥10 chars; `PATCH /v1/evidence/:id/reject` requires `reason` ≥20 chars.
2. Both endpoints call `SelfApprovalGuard.ensureNotSelf(actor, evidence.employee.user_id)`; self-approval returns 403.
3. On success, `approval_records` row is written with actor, decision, reason, timestamp.
4. Approve transitions state → APPROVED and enqueues `scoring.recalc-employee` via outbox; Reject transitions → REJECTED. Both emit audit events.

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

- E8.1
- E4.2

### References

- PRD FR-4.5, FR-4.6, §6.3, §9.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
