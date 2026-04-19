# Story 16.8: Snapshot/audit partition lifecycle automation and 3D long-session memory test

Status: backlog

## Story

As an operator,
I want ongoing partition maintenance and a long-session 3D memory check.

## Acceptance Criteria

1. A weekly job ensures 3 months of partitions exist ahead for `score_snapshots` and `audit_events`; a monthly job moves `score_snapshots` partitions older than 12 months to cold storage and `audit_events` partitions older than 24 months to cold storage.
2. A 1-hour scripted 3D session asserts JS heap growth < 20% of baseline and no leaked detached DOM nodes.
3. Sentry memory breadcrumbs enabled on the client.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E9.4
- E3.6
- E11.8

### References

- Arch §6.3, §6.4, AR-8, AR-9
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
