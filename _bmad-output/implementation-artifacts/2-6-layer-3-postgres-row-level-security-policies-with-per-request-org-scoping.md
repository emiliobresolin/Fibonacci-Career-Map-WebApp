# Story 2.6: Layer 3 Postgres Row-Level Security policies with per-request org scoping

Status: backlog

## Story

As a platform engineer,
I want Row-Level Security on every tenant-scoped table,
so that a cross-org read never succeeds even if the app forgets to scope.

## Acceptance Criteria

1. A Prisma migration enables RLS on every tenant-scoped table with a policy `USING (organization_id = current_setting('app.current_org_id')::uuid)`.
2. Request and job lifecycles set `app.current_org_id` from `ActorContext` and reset on completion.
3. A cross-org integration test seeds two orgs and asserts a read using org-A's context cannot return org-B rows.
4. A smoke test asserts setting `app.current_org_id` to a non-UUID returns a structured error, not a crash.

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

- E2.1
- E2.5

### References

- Arch §10.3 Layer 3, §10.4
- AR-4
- NFR-4.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
