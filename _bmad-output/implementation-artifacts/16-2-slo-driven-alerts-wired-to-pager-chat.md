# Story 16.2: SLO-driven alerts wired to pager + chat

Status: backlog

## Story

As an on-call operator,
I want alerts for the SLO thresholds in Arch §11.5.

## Acceptance Criteria

1. Prometheus alert rules for: API 5xx > 1% over 5 min (page); DLQ depth > 0 for any queue (page); recalc p95 > 60 s sustained 10 min (warn); DB pool > 85% (warn); BullMQ backlog > 5000 (warn); realtime disconnect rate > 5% / 5 min (warn).
2. Alertmanager routes pages to pager, warns to chat channel.
3. Each alert links to the matching runbook.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E16.1

### References

- Arch §11.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
