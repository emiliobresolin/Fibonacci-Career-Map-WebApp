# Story 6.4: First-Admin bootstrap flow

Status: backlog

## Story

As an Admin,
I want a first-admin bootstrap UI/CLI,
so that I can log in before OIDC is configured.

## Acceptance Criteria

1. A CLI command `fcm bootstrap-admin --org <slug>` creates the first ADMIN role_assignment, issues bootstrap fallback credentials, and prints the 10 OIDC-outage recovery codes.
2. When the first OIDC-linked ADMIN exists (via E2.2), the bootstrap credentials are automatically retired and the CLI refuses to recreate them.
3. Each action emits an audit event.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E2.7
- E6.1

### References

- PRD FR-1.2
- Arch §10.1
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
