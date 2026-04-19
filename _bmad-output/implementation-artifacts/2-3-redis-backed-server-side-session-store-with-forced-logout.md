# Story 2.3: Redis-backed server-side session store with forced-logout

Status: backlog

## Story

As an admin,
I want server-side session storage,
so that I can revoke sessions when required.

## Acceptance Criteria

1. Active sessions are indexed in Redis by `(organization_id, user_id)` with the session JWT jti.
2. An admin-only endpoint `POST /auth/sessions/:user_id/revoke` deletes all sessions for that user; subsequent API calls by that user return 401.
3. Session tokens expire at 24 h absolute; idle > 2 h triggers re-auth.
4. Revocation events emit an audit event via the outbox (see E3).

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

- E2.2
- E3.3

### References

- Arch §10.1
- FR-1.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
