# Story 16.5: Disaster-recovery drill (Postgres PITR + S3 versioning rollback)

Status: backlog

## Story

As an operator,
I want a documented, rehearsed DR drill.

## Acceptance Criteria

1. A staging drill restores Postgres to a point-in-time ≤15 min in the past and validates app functionality end-to-end.
2. An S3 versioning rollback drill recovers a noncurrent evidence object version.
3. RPO ≤ 24 h + ≤15 min PITR and RTO < 2 h validated and documented in `docs/ops/dr-drill.md`.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E1.5

### References

- Arch §12.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
