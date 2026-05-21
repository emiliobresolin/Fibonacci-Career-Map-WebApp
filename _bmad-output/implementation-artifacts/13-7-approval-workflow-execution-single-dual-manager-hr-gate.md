# Story 13.7: Approval workflow execution (`SINGLE` / `DUAL_MANAGER` / `HR_GATE`)

Status: backlog

## Story

As a workflow engine,
I want to execute the approval chain honoring per-org / per-level configuration.

## Acceptance Criteria

1. `PATCH /v1/promotions/:id/approve` and `/reject` advance the state machine per workflow; self-approval rejected via the E2.5 `SelfApprovalGuard`.
2. In `SINGLE`, the Manager's recommendation completes the promotion in one step (see PRD §6.5: not considered self-approval because the recommender and the promotion subject are distinct identities; the guard still rejects the rare self-recommendation edge case).
3. In `DUAL_MANAGER`, a second Manager or Admin must co-approve; the co-approver cannot be the recommender (`SelfApprovalGuard`).
4. In `HR_GATE`, Admin/HR must counter-sign; HR approver cannot be the recommender.
5. **Mid-flight workflow config change:** in-flight promotions are governed by `promotion_records.workflow_at_initiate` snapshotted at E13.4 commit time, not by current org/level config. New promotions initiated after the config change use the new workflow.
6. Each action requires a `reason` field on reject; rejection emits notification to the initiating Manager with reason.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4
- [ ] Task covering AC #5
- [ ] Task covering AC #6

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E13.4
- E13.6
- E7.7
- E2.5
- E2.6
- E3.3

### References

- PRD FR-7.5, FR-7.6, §6.5, §8.7
- Arch §5.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
