# Story 5.1: Socket.IO server and Redis adapter

Status: backlog

## Story

As an engineer,
I want a Socket.IO server integrated into `fcm-api` with the Redis adapter,
so that realtime fanout scales horizontally.

## Acceptance Criteria

1. Socket.IO server runs inside `fcm-api`; Redis adapter configured against the same Redis used by BullMQ and sessions.
2. Running two API replicas locally, a message emitted through either instance reaches all connected clients.
3. Connection logs include `correlation_id`.

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

- Arch §8.1, §8.4
- AD-6
- AR-7
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
