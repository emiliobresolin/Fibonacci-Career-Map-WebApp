# Story 9.8: Forecast window selector contract and new-employee edge cases

Status: backlog

## Story

As an Employee,
I want to select a 3/6/12-month forecast window and receive an honest confidence signal when history is thin.

## Acceptance Criteria

1. `GET /v1/employees/:id/snapshot/latest?forecast_window_months=3|6|12` returns the snapshot plus a window-appropriate view of ETA/Confidence (velocity remains 90-day per PRD §7.6, but display semantics change).
2. For new employees with <30 days of history, the response includes `eta_display = "Insufficient data"` and `confidence = "Low"`.
3. The response DTO exposes `recalculation_pending` and `recalculation_stale` from E4.6.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E9.5
- E4.6

### References

- PRD §14.4, FR-5.12, §5.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
