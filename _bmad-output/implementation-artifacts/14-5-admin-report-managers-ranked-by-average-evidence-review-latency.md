# Story 14.5: Admin report: managers ranked by average evidence review latency

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `/analytics/manager-engagement` (ADMIN only) shows a table ranking managers by average evidence review latency over the last 30 days.
2. Data sourced from the E8.8 Prometheus histogram via a server-side aggregation query over `approval_records`.
3. CSV export available.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E8.8
- E14.3

### References

- PRD FR-12.3, FR-12.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
