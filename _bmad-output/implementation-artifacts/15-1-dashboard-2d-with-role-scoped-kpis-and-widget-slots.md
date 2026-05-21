# Story 15.1: Dashboard (2D) with role-scoped KPIs and widget slots

Status: backlog

## Story

As a user,
I want a summary dashboard with role-scoped KPIs, quick links, a notifications preview, and named slots that other epics can fill.

## Acceptance Criteria

1. `/dashboard` route renders role-scoped KPIs: Employee (own progression summary), Manager (team summary), Admin (org-wide KPIs).
2. The Manager dashboard exposes two named widget slots (`<DashboardSlot name="manager.pending-reviews" />` and `<DashboardSlot name="manager.stale-reviews" />`) that render placeholder skeletons in this story and are filled by STORY-E14.4 when that lands; the slot contract is part of `domain-contracts` so E14.4 can build against it without touching this route.
3. Quick links to Career Map, Analytics (Admin/Manager), Settings (Admin).
4. Notifications preview block (last 5).

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

- E9.4

### References

- PRD FR-11.1–11.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
