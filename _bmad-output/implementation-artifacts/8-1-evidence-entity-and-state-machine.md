# Story 8.1: Evidence entity and state machine

Status: backlog

## Story

As a system,
I want a formal evidence state machine,
so that every transition is legal and auditable.

## Acceptance Criteria

1. Migration creates `evidence (id, organization_id, employee_id, requirement_id, state enum(DRAFT|PENDING_APPROVAL|APPROVED|REJECTED|EXPIRED), payload JSONB nullable, storage_object_key TEXT nullable, submitted_at, approved_at nullable, expires_at nullable, created_at, updated_at)`.
2. A domain-layer `EvidenceStateMachine` rejects any illegal transition with a structured error.
3. Unit tests cover every legal and illegal transition.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E6.2
- E2.6

### References

- Arch §6.2
- PRD FR-4.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
