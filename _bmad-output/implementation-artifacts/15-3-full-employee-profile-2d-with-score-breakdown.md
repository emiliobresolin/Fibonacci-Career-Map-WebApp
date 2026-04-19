# Story 15.3: Full Employee Profile (2D) with Score Breakdown

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `/profile/:employee_id` renders complete evidence history, approval history, audit slice for the employee, full score-change timeline, and the Score Breakdown consuming E9.7.
2. Shareable URL; RBAC: self, direct manager, Admin.
3. Page renders with RSC; client islands for interactive charts.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E9.7
- E3.5

### References

- PRD §5.4, FR-8.6, FR-8.7
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
