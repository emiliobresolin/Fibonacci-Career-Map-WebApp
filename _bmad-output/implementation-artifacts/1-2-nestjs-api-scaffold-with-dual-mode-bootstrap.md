# Story 1.2: NestJS API scaffold with dual-mode bootstrap

Status: backlog

## Story

As an engineer,
I want `apps/api` to boot either as an HTTP API or as a BullMQ worker from the same codebase,
so that production runs one artifact in two process modes.

## Acceptance Criteria

1. `apps/api` starts under `API_MODE=api` exposing a placeholder `GET /healthz` returning `{status:"ok"}`.
2. Same process starts under `API_MODE=worker` initializing NestJS without binding an HTTP port, logging "worker-mode ready".
3. NestJS `CommonModule` provides a shared pino logger and configuration module wired from environment variables.
4. Mode is selected through a single bootstrap entrypoint; no code duplication between modes.

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

- E1.1

### References

- Arch §3.2
- AD-1
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
