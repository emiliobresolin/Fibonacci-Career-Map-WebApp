# Story 1.1: Monorepo workspace scaffold

Status: backlog

## Story

As an engineer,
I want a monorepo workspace matching architecture §18,
so that every subsequent story lands in the correct location.

## Acceptance Criteria

1. Root workspace (`apps/web`, `apps/api`, `packages/domain-contracts`, `packages/scoring-core`, `infra/`, `docs/`) exists with a shared package-manager workspace manifest.
2. `tsconfig.base.json` enforces TypeScript strict mode and is extended by every workspace.
3. Internal packages are resolvable via workspace protocol in `apps/web` and `apps/api`.
4. Repo-root `README.md` documents workspace layout and dev/build commands.

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

- None

### References

- Arch §18
- AG1, AG7
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
