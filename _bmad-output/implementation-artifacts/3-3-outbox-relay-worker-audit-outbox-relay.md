# Story 3.3: Outbox relay worker (`audit.outbox-relay`)

Status: backlog

## Story

As a system,
I want a worker that reads unpublished outbox rows and fans them out to audit, jobs, and realtime with at-least-once semantics.

## Acceptance Criteria

1. BullMQ queue `audit.outbox-relay` exists; consumer listens to Postgres `LISTEN outbox_new` and enqueues relay jobs.
2. For each unpublished row, the worker writes to `audit_events`, enqueues any downstream jobs declared in the payload, publishes the realtime event via Redis pub/sub, and marks `published_at = NOW()`.
3. Consumers are idempotent: a duplicate `event_id` delivered twice does not produce duplicate audit writes or double side-effects.
4. DLQ routing and a Prometheus `fcm_outbox_relay_depth` gauge are wired; a depth > 0 for > 5 minutes alerts (alert rule defined in E16 but metric emitted here).

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

- E3.2
- E4.1

### References

- Arch §9.3, §11.2
- AD-7
- AR-3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
