# Story 14.1: `notifications` table and NotificationService

Status: backlog

## Story

As a user,
I want a persistent in-app notification store.

## Acceptance Criteria

1. Migration creates `notifications(id, organization_id, user_id, kind, payload JSONB, read_at nullable, created_at)`.
2. `NotificationService.create(actor, target_user_id, kind, payload)` writes and emits realtime via outbox to `user:{target_user_id}`.
3. RLS applies: a user can read only their own notifications.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E3.3
- E2.6

### References

- Arch §5.1 notification
- PRD FR-9.2, FR-9.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
