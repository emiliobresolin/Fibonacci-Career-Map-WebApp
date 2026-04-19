# Story 1.8: Health probes and worker heartbeat

Status: backlog

## Story

As an operator,
I want liveness/readiness probes on the API and a heartbeat on the worker,
so that Kubernetes can route traffic safely.

## Acceptance Criteria

1. `GET /healthz` returns 200 when the process is up.
2. `GET /readyz` returns 200 only when Postgres, Redis, and OIDC discovery document are all reachable; returns 503 otherwise with a structured body naming the failing dependency.
3. Worker process publishes a BullMQ heartbeat event every 30 s; absence for 2 min raises a Prometheus alert (alert definition lands in E16 but the metric is emitted here).
4. Probes are wired into the Kubernetes manifests from E1.6.

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

- E1.6
- E1.7

### References

- Arch §11.7
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
