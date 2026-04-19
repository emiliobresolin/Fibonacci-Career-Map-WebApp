# Story 11.8: Client performance instrumentation and end-of-session beacon

Status: backlog

## Story

As an operator,
I want 3D performance telemetry,
so that regressions are caught early.

## Acceptance Criteria

1. Client captures FPS histogram, dropped-frame count, draw calls, triangle count, JS heap for the scene during the session.
2. At session end (or navigation away), a non-blocking `navigator.sendBeacon` posts metrics to `POST /v1/metrics/client`.
3. `observability.client-metrics` queue consumer writes to Prometheus via the server-side metrics registry.
4. No PII in the beacon payload.

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

- E11.4
- E4.2

### References

- Arch §4.3 rule 12, §11.2
- NFR-1.1
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
