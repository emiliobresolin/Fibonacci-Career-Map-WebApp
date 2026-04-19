# Story 4.2: Domain queue definitions

Status: backlog

## Story

As a team,
I want all architecture-listed queues defined,
so that downstream epics don't block on missing plumbing.

## Acceptance Criteria

1. Queues `scoring.recalc-employee`, `scoring.recalc-org-bulk`, `evidence.expiry-scan`, `snapshot.partition-maintenance`, `notification.deliver`, `observability.client-metrics` exist with the per-queue settings in Arch §7.2.
2. Each queue exports a typed `enqueue<JobName>` helper from the jobs module; consumers are stubbed with an explicit "not-implemented" handler that throws.
3. Prometheus metrics emitted per queue: depth, processing-duration histogram, DLQ depth.

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
- NFR-6.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
