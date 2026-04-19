# Story 14.2: Event consumers: evidence, scoring, promotion, configuration

Status: backlog

## Story

As a system,
I want NotificationService to subscribe to the key domain events.

## Acceptance Criteria

1. Consumer of `notification.deliver` translates each of the following into notifications: `evidence.pending_review`, `evidence.approved`, `evidence.rejected`, `score.recalculated` (only when Promotion Eligibility flips or level boundary crossed), `promotion.recommended`, `promotion.completed`, `promotion.rejected`, `config.changed.affects_user`.
2. Idempotent by `event_id`.
3. Integration test covers one instance of each.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E14.1
- E8.4
- E9.5
- E13.8
- E7.9

### References

- PRD FR-9.1
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
