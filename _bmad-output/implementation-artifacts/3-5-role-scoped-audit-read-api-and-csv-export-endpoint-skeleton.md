# Story 3.5: Role-scoped audit read API and CSV export endpoint skeleton

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `GET /v1/audit-events` accepts `actor_id`, `event_type`, `entity_type`, `entity_id`, `occurred_at` range; returns cursor-paginated results scoped to the actor's role (own / team / all).
2. `GET /v1/audit-events/export` streams a CSV with the same filters applied; runs behind the same RBAC.
3. An EMPLOYEE calling the endpoint receives only events where they are the actor or the target; MANAGER sees team-scoped; ADMIN sees all.
4. Integration tests cover the three role scopes and assert no cross-org leakage.

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

- E3.4

### References

- PRD FR-8.4, FR-8.5, FR-8.6, FR-8.7. PDF export belongs to E15 where the UI lives
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
