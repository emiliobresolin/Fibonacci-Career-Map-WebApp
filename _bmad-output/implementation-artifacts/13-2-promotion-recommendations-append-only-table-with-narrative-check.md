# Story 13.2: `promotion_recommendations` append-only table with narrative check

Status: backlog

## Story

As a platform engineer,
I want a separate append-only table for the Manager's Performance Narrative,
so that the narrative is always immutable.

## Acceptance Criteria

1. Migration creates `promotion_recommendations(id, promotion_record_id FK, manager_id, performance_narrative TEXT NOT NULL CHECK (char_length(performance_narrative) >= 200), recommended_at)`.
2. Table has `INSERT`-only grant; `UPDATE` and `DELETE` revoked for the app role.
3. Unit test asserts a 199-char narrative is rejected by DB; 200+ accepted.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E13.1

### References

- PRD FR-7.10, FR-7.11, §6.5
- Arch §5.4, §6.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
