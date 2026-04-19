# Story 8.8: Evidence review latency metric

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. On `evidence.approved` / `evidence.rejected` events, a `fcm_evidence_review_latency_seconds` histogram is emitted labeled by `manager_user_id`.
2. The metric is exposed on the auth-gated `/metrics` endpoint.
3. A dashboard panel stub is committed in `ops/grafana/` (the full dashboard lands in E16).

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E8.4
- E1.7

### References

- PRD FR-12.4
- Arch §11.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
