# Story 7.6: Visibility Rules CRUD

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `GET/PATCH /v1/organizations/me/visibility` exposes the four modes (`OWN_ONLY`, `TEAM`, `ORG_SUMMARY`, `ORG_FULL`); ADMIN-only.
2. Updating the rule triggers a `config.visibility.changed` outbox event so the Map Data Contract (E10) invalidates cached projections.
3. Mutation emits an audit event with `before`/`after`.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E7.1
- E3.3

### References

- PRD FR-6.6, §8.6, §14.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
