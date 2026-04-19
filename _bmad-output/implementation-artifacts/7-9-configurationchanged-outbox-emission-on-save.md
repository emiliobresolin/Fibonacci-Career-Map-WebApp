# Story 7.9: ConfigurationChanged outbox emission on save

Status: backlog

## Story

As a system,
I want configuration saves to emit `ConfigurationChanged` via the outbox,
so that bulk recalculation (E9) fires automatically.

## Acceptance Criteria

1. Every successful track/level/layer/requirement/promotion-rule mutation inserts an `outbox_events` row with `event_type = 'configuration.changed'`, payload `{ change_type, entity_id, affected_employee_ids[] }` in the same DB transaction.
2. Affected-employee resolution is cheap and bounded; large changes chunk into multiple outbox rows if the list exceeds the configured chunk size.
3. Integration test asserts no outbox row appears on a rolled-back transaction.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E7.1–E7.5
- E3.3

### References

- PRD FR-6.9, FR-6.10
- Arch §5.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
