# Story 1.4: Prisma schema baseline and migration tooling

Status: backlog

## Story

As an engineer,
I want a Prisma baseline wired into `apps/api` and a migration pipeline integrated into CI,
so that later stories add tables safely.

## Acceptance Criteria

1. `apps/api/prisma/schema.prisma` exists with provider `postgresql` and a single placeholder model (`_MigrationProbe`) to validate migration flow.
2. `prisma migrate dev` runs locally against a dev Postgres; `prisma migrate deploy` runs as a dedicated CI job against staging.
3. Generated Prisma client is imported from a single exported module inside the API.
4. Database URL is loaded from secrets (never committed); `.env.example` documents the variable.

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

- E1.2

### References

- Arch §6.5, §12.4
- AD-8
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
