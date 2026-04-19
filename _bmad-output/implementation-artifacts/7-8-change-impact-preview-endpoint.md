# Story 7.8: Change-impact preview endpoint

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `POST /v1/configuration/preview-impact` accepts a proposed change (track/level/layer/requirement/promotion rule) and returns `{ affected_employee_count, sample_employee_ids[<=20] }`.
2. Preview runs deterministically against current state; no writes occur.
3. Unit test asserts count accuracy across representative shapes of change.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E7.4
- E7.5

### References

- PRD FR-6.8
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
