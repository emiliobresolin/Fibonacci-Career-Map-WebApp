# Story 13.5: `POST /v1/promotions/:id/recommend` (if workflow uses a separate recommend step)

Status: backlog

## Story

As a Manager in a workflow that separates "initiate" from "recommend",
I want an explicit recommend endpoint.

## Acceptance Criteria

1. For organizations whose workflow is `DUAL_MANAGER` or `HR_GATE`, the initial `POST /employees/:id/promotions` creates the record in `RECOMMENDED` state and this endpoint is not needed; this story covers workflows that may later require an explicit re-recommend after a calibration release (the endpoint exists for API completeness and audit trail).
2. Behavior: transitions back to `IN_REVIEW` after `CALIBRATION_HOLD → RESOLVED_RELEASE`; requires `re_recommendation_reason` ≥40 chars.
3. Audit event captures the re-recommend context.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E13.4
- E13.6

### References

- Arch §13.2
- PRD §6.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
