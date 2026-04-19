# Story 2.4: Layer 1 AuthGuard, @Roles decorator, CORS lock-down

Status: backlog

## Story

As an engineer,
I want a global AuthGuard and a `@Roles(...)` decorator,
so that every endpoint enforces role checks by default.

## Acceptance Criteria

1. Global NestJS `AuthGuard` validates the JWT, rejects unauthenticated requests with 401, and populates `request.user = { user_id, organization_id, role }`.
2. A `@Roles('ADMIN' | 'MANAGER' | 'EMPLOYEE')` decorator restricts routes; unmatched role returns 403 with a structured error body.
3. CORS allow-list is loaded from configuration; requests from unlisted origins are rejected.
4. An integration test asserts 401 on missing token, 403 on role mismatch, and 200 on matched role.

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

### References

- Arch §10.3 Layer 1
- FR-1.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
