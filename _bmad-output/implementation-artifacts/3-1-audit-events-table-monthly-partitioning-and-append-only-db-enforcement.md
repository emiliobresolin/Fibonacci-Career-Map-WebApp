# Story 3.1: `audit_events` table, monthly partitioning, and append-only DB enforcement

Status: backlog

## Story

As a compliance engineer,
I want an append-only partitioned audit log,
so that every mutation leaves a tamper-resistant record.

## Acceptance Criteria

1. Migration creates `audit_events` (organization_id, actor_id, event_type, entity_type, entity_id, before JSONB, after JSONB, reason TEXT, occurred_at TIMESTAMPTZ) partitioned by `RANGE (occurred_at)` monthly; 3 months of partitions pre-created.
2. GIN indexes on `before` and `after`; B-tree on `(organization_id, occurred_at)` and `(entity_type, entity_id, occurred_at)`.
3. App DB role has `INSERT` only; `UPDATE` and `DELETE` are revoked. A BEFORE UPDATE/DELETE trigger raises an exception as defense-in-depth.
4. An integration test asserts an attempted UPDATE or DELETE from the app role fails.

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

- E1.4
- E2.1

### References

- Arch §6.4, §9.3
- AD-7
- NFR-5.1, NFR-5.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
