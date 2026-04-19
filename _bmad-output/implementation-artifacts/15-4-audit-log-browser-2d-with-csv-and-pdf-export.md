# Story 15.4: Audit Log Browser (2D) with CSV and PDF export

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `/audit` route; role-scoped (own / team / all per E3.5).
2. Filters: actor, event_type, entity, date range; cursor pagination.
3. CSV export reuses E3.5 endpoint; PDF export renders a server-side PDF of the filtered result set.
4. Accessibility: keyboard-navigable filter controls, screen-reader table markup.

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

- E3.5

### References

- PRD FR-8.4, FR-8.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
