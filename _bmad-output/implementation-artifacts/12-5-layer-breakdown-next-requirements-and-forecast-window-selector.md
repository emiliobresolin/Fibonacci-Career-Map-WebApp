# Story 12.5: Layer breakdown, Next Requirements, and forecast window selector

Status: backlog

## Story

As an Employee or Manager,
I want the detail panel to show the layer-by-layer breakdown, the Next Requirements list, and a 3/6/12-month forecast selector.

## Acceptance Criteria

1. Capability / Delivery / Influence rendered as progress bars with percentages, sourced from E9.7.
2. Next Requirements list displays the top 3–5 open items relevant to promotion.
3. Forecast window selector toggles between 3/6/12 months via the E9.8 API.
4. Recalculation-pending indicator shows while a recalc is in flight for the viewed employee.

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

- E12.4
- E9.7
- E9.8

### References

- PRD FR-3.4, FR-3.5, FR-3.8, FR-5.12
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
