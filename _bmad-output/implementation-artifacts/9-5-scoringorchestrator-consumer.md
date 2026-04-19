# Story 9.5: ScoringOrchestrator consumer

Status: backlog

## Story

As a system,
I want the recalc-employee consumer to orchestrate pure functions, persist a snapshot, and emit events.

## Acceptance Criteria

1. Consumer of `scoring.recalc-employee` claims `recalc_jobs` via E4.3, loads inputs as-of `triggering_event.occurred_at`, calls pure functions, inserts a new `score_snapshots` row, marks the job `completed`, and emits `score.recalculated` via outbox.
2. Idempotent: a duplicate `(employee_id, triggering_event_id)` pair short-circuits.
3. SHA-256 `inputs_hash` computed from evidence set + config version and persisted.
4. Integration test runs end-to-end: approve evidence → snapshot appears → `employee_current_snapshot` reflects it.

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

- E9.1
- E9.2
- E9.3
- E9.4
- E4.3

### References

- Arch §7.3, §9.4
- PRD FR-5.7, FR-5.8, FR-5.9, FR-5.10
- AR-3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
