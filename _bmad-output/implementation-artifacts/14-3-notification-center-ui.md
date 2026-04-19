# Story 14.3: Notification Center UI

Status: backlog

## Story

As a user,
I want a notification center with filter, pagination, and read/unread state.

## Acceptance Criteria

1. `/notifications` route (or overlay) lists notifications with unread-first ordering and a read/unread toggle.
2. `PATCH /v1/notifications/:id/read` marks as read; bulk "mark all read" action available.
3. Unread count rendered as a top-nav badge.
4. Realtime updates: new notifications appear without page refresh.

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

- E14.1
- E5.5

### References

- PRD FR-9.2, FR-9.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
