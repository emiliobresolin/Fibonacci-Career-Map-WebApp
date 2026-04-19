# Story 15.7: Manager Approval Pattern Report (2D, HR)

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `/analytics/manager-approval-patterns` (HR only) shows per-manager: promotions recommended (count), eligibility-to-recommendation latency distribution, Performance Narrative length distribution, rejection rates.
2. Tabular + chart view; CSV export.
3. Data sourced from `promotion_records`, `promotion_recommendations`, `score_snapshots`.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E13.2
- E13.4
- E9.4

### References

- PRD FR-10.7, §11.10
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
