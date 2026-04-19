# Story 14.4: Manager Dashboard "Pending Reviews" and "Stale Reviews" widgets

Status: backlog

## Story

As a Manager,
I want a Pending-Reviews badge and a Stale-Reviews section (> 7 days),
so that I can act on engagement nudges.

## Acceptance Criteria

1. Dashboard widget "Pending Reviews" shows the count of evidence in `PENDING_APPROVAL` for the manager's reports.
2. Widget "Stale Reviews" lists evidence pending > 7 days, with elevated visual emphasis (warning color, aging indicator).
3. Both widgets refresh on realtime `evidence.*` events.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E14.3
- E8.4
- E15.1

### References

- PRD FR-12.1, FR-12.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
