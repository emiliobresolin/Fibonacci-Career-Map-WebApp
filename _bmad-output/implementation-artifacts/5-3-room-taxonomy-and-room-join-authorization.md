# Story 5.3: Room taxonomy and room-join authorization

Status: backlog

## Story

As a platform engineer,
I want the four rooms (`user:`, `org:`, `employee:`, `manager-team:`) with server-side join authorization,
so that clients cannot join rooms they are not entitled to.

## Acceptance Criteria

1. A client joining `user:{id}` must match the socket's `user_id`; else reject.
2. A client joining `org:*` must have ADMIN role; else reject.
3. A client joining `employee:{id}` must pass visibility/RBAC (self, direct manager, or ADMIN); else reject.
4. A client joining `manager-team:{manager_user_id}` must be that manager or ADMIN; else reject.
5. Reject reasons emit a structured audit-adjacent log (not an audit event) with `correlation_id`.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4
- [ ] Task covering AC #5

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E5.2

### References

- Arch §8.2, §8.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
