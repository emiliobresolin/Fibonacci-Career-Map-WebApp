# Story 13.7: Approval workflow execution (`SINGLE` / `DUAL_MANAGER` / `HR_GATE`)

Status: backlog

## Story

As a workflow engine,
I want to execute the approval chain honoring per-org / per-level configuration.

## Acceptance Criteria

1. `PATCH /v1/promotions/:id/approve` and `/reject` advance the state machine per workflow; self-approval rejected via E2.5 guard.
2. In `SINGLE`, the Manager's recommendation completes the promotion.
3. In `DUAL_MANAGER`, a second Manager or Admin must co-approve.
4. In `HR_GATE`, Admin/HR must counter-sign.
5. Each action requires a `reason` field on reject; rejection emits notification to the initiating Manager with reason.

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

- E13.4
- E7.7

### References

- PRD FR-7.5, FR-7.6, §6.5, §8.7
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
