# Story 7.5: Promotion Rules CRUD per level

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `GET/POST/PATCH /v1/levels/:id/promotion-rule`; ADMIN-only.
2. Fields: `min_score`, `mandatory_completion_required BOOL`, `min_time_at_level_months INT nullable`, `manager_approval_required BOOL`, `hr_counter_sign_required BOOL`, `active_blocker_check BOOL`.
3. Mutation emits audit event.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E7.2

### References

- PRD FR-6.5, §8.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
