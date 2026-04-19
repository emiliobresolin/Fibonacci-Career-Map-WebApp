# Story 16.1: Grafana dashboards shipped in-repo

Status: backlog

## Story

As an operator,
I want the full Grafana dashboard set committed and deployed via CI.

## Acceptance Criteria

1. `ops/grafana/` contains dashboard JSON for: API (RED metrics), Workers (queue depth/duration, DLQ), Realtime (connected clients, disconnect rate, fanout latency), 3D client FPS distribution, Evidence review latency per manager.
2. A CI job provisions dashboards to dev/staging Grafana on merge to main.
3. Dashboards documented in `docs/ops/dashboards.md`.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E1.7
- E4.2
- E5.5
- E8.8
- E11.8

### References

- Arch §11.2, §11.6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
