# Story 5.2: WebSocket handshake authentication using the same session JWT

Status: backlog

## Story

As a security-conscious engineer,
I want every WebSocket connection authenticated via the API's session JWT,
so that unauthenticated clients cannot connect.

## Acceptance Criteria

1. Handshake rejects a connection whose JWT is missing, malformed, expired, or revoked; structured reason is logged.
2. A successful handshake attaches `ActorContext` to the socket session.
3. Integration tests cover success, expired token, and revoked-session cases.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E5.1
- E2.2
- E2.3

### References

- Arch §8.5
- AD-6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
