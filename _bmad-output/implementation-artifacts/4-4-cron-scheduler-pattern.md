# Story 4.4: Cron scheduler pattern

Status: backlog

## Story

As an operator,
I want a declarative cron pattern,
so that scheduled jobs land consistently.

## Acceptance Criteria

1. A `@Cron('CRON_EXPR', 'queueName')` decorator wires a scheduled enqueue via BullMQ repeatable jobs.
2. At least one dev-mode cron (a no-op heartbeat every minute) is registered and visible in queue metrics.
3. Timezone defaulted to UTC; configurable per-job.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E4.1

### References

- Arch §7.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
