# Story 4.6: Recalculation-status primitives exposed via `domain-contracts`

Status: backlog

## Story

As a frontend developer,
I want `recalculation_pending` and `recalculation_stale` flags formalized,
so that the UI can render pending state before the orchestrator lands.

## Acceptance Criteria

1. `packages/domain-contracts` exports an `EmployeeRecalcStatus` type used by later stories' DTOs.
2. Status transitions: `idle → pending → (completed | stale)`; `stale` triggers when a pending job has exceeded its SLA (configurable, default 60 s).
3. Unit tests cover every transition.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E4.3

### References

- Arch §5.2
- FR-5.12
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
