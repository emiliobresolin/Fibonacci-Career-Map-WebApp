# Story 6.2b: employee_blockers table for active-blocker eligibility check

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. Migration creates `employee_blockers(id UUID PK, organization_id UUID FK, employee_id UUID FK, kind blocker_kind_enum('PIP','PERFORMANCE_CONCERN','HR_HOLD','OTHER'), reason TEXT NOT NULL CHECK (char_length(reason) >= 20), opened_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ NULL, opened_by UUID FK, resolved_by UUID FK NULL)` with RLS and partial unique index `(employee_id, kind) WHERE resolved_at IS NULL`.
2. Admin/HR-only API: `POST /v1/employees/:id/blockers` and `PATCH /v1/blockers/:id/resolve`; non-Admin returns 403.
3. Every open/resolve action emits an audit event via outbox.
4. Integration test: opening a blocker flips Eligibility to `NOT_ELIGIBLE` on the next recalc; resolving restores it.

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

- E6.2a
- E3.3

### References

- PRD §7.5 condition 4, §8.5
- Arch §6.2 (`employee_blockers`)
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
