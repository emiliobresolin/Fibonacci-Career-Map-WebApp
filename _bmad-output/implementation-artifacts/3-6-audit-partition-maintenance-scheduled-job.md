# Story 3.6: Audit partition maintenance scheduled job

Status: backlog

## Story

As an operator,
I want partitions for `audit_events` created ahead of time,
so that inserts never fail on a missing partition.

## Acceptance Criteria

1. A cron job (weekly) ensures that monthly partitions for the next 3 months exist; creates any missing partitions.
2. The job is idempotent: repeated runs do not produce errors.
3. Metric `fcm_audit_partition_lookahead_months` exported; runbook stub in `docs/ops/runbooks/audit-partition.md`.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E3.1
- E4.2

### References

- Arch §6.4
- AR-8
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
