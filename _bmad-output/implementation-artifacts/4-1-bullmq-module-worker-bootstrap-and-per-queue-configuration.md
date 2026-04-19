# Story 4.1: BullMQ module, worker bootstrap, and per-queue configuration

Status: backlog

## Story

As an engineer,
I want `@nestjs/bullmq` wired into the worker with per-queue concurrency/backoff/DLQ defaults,
so that later consumers plug in cleanly.

## Acceptance Criteria

1. `JobsModule` loads queue configuration from a typed `QueuesConfig` map (name, concurrency, backoff, maxAttempts, rateLimit, DLQ target).
2. Worker process registers consumers only when running in worker mode.
3. A smoke test enqueues a no-op job and asserts completion; failed test job lands in the DLQ after exhausting retries.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E1.2
- E1.5

### References

- Arch §7.1, §7.2
- AD-5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
