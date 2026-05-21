# Story 13.6: `POST /v1/promotions/:id/recommend` (re-recommend after calibration release)

Status: backlog

## Story

As a Manager whose pending promotion was placed on calibration hold and then released,
I want a re-recommend endpoint,
so that the approval chain can resume cleanly.

## Acceptance Criteria

1. `POST /v1/promotions/:id/recommend` is accepted only when the promotion is currently in state `CALIBRATION_HOLD` with the linked flag transitioned to `RESOLVED_RELEASE` (per E13.5); any other source state returns `INVALID_TRANSITION`.
2. Request body requires `re_recommendation_reason` ≥40 chars; rejected with `REASON_TOO_SHORT` otherwise.
3. On success, transitions the record back to `IN_REVIEW` so the approval chain resumes from the post-recommendation state (workflow is read from `promotion_records.workflow_at_initiate` — see E13.4 — so a mid-flight config change does NOT re-evaluate the workflow).
4. For `SINGLE` mode this endpoint is rarely used (release+approve typically collapses); the endpoint is still accepted to keep API shape consistent across workflows.
5. Audit event captures the re-recommend context including the resolved flag id.

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
- E13.5
- E2.5
- E2.6
- E3.3

### References

- Arch §13.2, §5.4
- PRD §6.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
