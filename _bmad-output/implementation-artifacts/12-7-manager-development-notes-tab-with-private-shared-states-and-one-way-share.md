# Story 12.7: Manager Development Notes tab with PRIVATE/SHARED states and one-way share

Status: backlog

## Story

As a Manager,
I want a Development Notes tab,
so that I can capture private coaching context next to scoring data and optionally share specific notes.

## Acceptance Criteria

1. Tab visible only to Manager (on direct report) and HR.
2. `GET/POST /v1/employees/:id/development-notes` implemented with `visibility enum(PRIVATE, SHARED_WITH_EMPLOYEE)`, default `PRIVATE`.
3. `PATCH /v1/development-notes/:id/share` transitions `PRIVATE → SHARED_WITH_EMPLOYEE`; reverse transition is rejected (DB trigger + domain guard).
4. Employee viewing own panel sees only shared notes (never PRIVATE); `developmentnotes` RBAC per Arch §5.1.
5. Each note create and share emits an audit event via outbox.

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

- E12.4
- E3.3

### References

- PRD §5.2 Development Notes, FR-3.14
- Arch §5.1 developmentnotes, §5.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
