# Story 2.5: Layer 2 ActorContext propagation and self-approval guard primitive

Status: backlog

## Story

As a backend developer,
I want every domain service method to receive an `ActorContext` and a reusable self-approval guard,
so that business-level authorization is explicit and testable.

## Acceptance Criteria

1. A `ServiceContext` module provides an `ActorContext` object (`{ user_id, organization_id, role, display_name }`) available in REST handlers, WebSocket handlers, and BullMQ job payloads.
2. A `SelfApprovalGuard.ensureNotSelf(actor, subjectUserId)` primitive throws `SelfApprovalNotAllowedError` when `actor.user_id === subjectUserId`.
3. An example service method consumes `ActorContext` and calls the guard; a failing and a passing unit test cover both outcomes.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E2.4

### References

- Arch §10.3 Layer 2
- PRD §9.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
