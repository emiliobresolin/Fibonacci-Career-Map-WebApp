# Story 15.1: Dashboard (2D) with role-scoped KPIs

Status: backlog

## Story

As a user,
I want a summary dashboard with role-scoped KPIs, quick links, and a notifications preview.

## Acceptance Criteria

1. `/dashboard` route renders role-scoped KPIs: Employee (own progression summary), Manager (team summary + pending-review widgets from E14.4), Admin (org-wide KPIs).
2. Quick links to Career Map, Analytics (Admin/Manager), Settings (Admin).
3. Notifications preview block (last 5).

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E9.4
- E14.4

### References

- PRD FR-11.1–11.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
