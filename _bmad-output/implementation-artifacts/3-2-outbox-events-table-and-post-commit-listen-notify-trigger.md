# Story 3.2: `outbox_events` table and post-commit LISTEN/NOTIFY trigger

Status: backlog

## Story

As a backend engineer,
I want an outbox table and a post-commit notification,
so that the relay worker can discover new events without polling.

## Acceptance Criteria

1. Migration creates `outbox_events` (event_id UUID PK, organization_id, aggregate_type, aggregate_id, event_type, payload JSONB, created_at, published_at nullable).
2. An AFTER INSERT trigger on `outbox_events` calls `pg_notify('outbox_new', event_id)`.
3. Index on `(published_at NULLS FIRST, created_at)` for the relay to batch unpublished rows.
4. A sample write in a transaction demonstrates the trigger fires on commit and not on rollback.

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

- E3.1

### References

- Arch §9.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
