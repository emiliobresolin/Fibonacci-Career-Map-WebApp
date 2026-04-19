# Story 5.5: Web client Socket.IO hook with TanStack Query cache invalidation, and polling fallback

Status: backlog

## Story

As a frontend developer,
I want a `useRealtime()` hook that connects to the API, invalidates the right TanStack Query keys on events, and transparently falls back to polling when the socket drops.

## Acceptance Criteria

1. `useRealtime()` connects on session ready, subscribes to the user's `user:{user_id}` room automatically, and exposes a subscribe-to-employee API.
2. On `snapshot.updated`, the affected employee's query keys are invalidated; the map instance-attribute updater (wired in E11) is called with the new values.
3. On WS disconnect > 10 s, the hook begins polling `GET /v1/latest-snapshots?since=...` every 30 s with `If-Modified-Since`.
4. Realtime metrics exported client-side (connected clients, disconnect rate, polling-fallback active) and beaconed via `/metrics/client` at session end.

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

- E5.2
- E5.4

### References

- Arch §4.5, §8.1, §11.2
- FR-5.12
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
