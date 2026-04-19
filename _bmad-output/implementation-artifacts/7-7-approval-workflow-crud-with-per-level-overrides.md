# Story 7.7: Approval Workflow CRUD with per-level overrides

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `GET/PATCH /v1/organizations/me/approval-workflow`; `GET/PATCH /v1/levels/:id/approval-workflow` (nullable; null falls back to org default).
2. Supported values: `SINGLE`, `DUAL_MANAGER`, `HR_GATE`.
3. Mutation emits audit event.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E7.1
- E7.2

### References

- PRD FR-6.7, §8.7
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
