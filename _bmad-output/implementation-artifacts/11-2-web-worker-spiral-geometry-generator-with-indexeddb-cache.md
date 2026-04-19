# Story 11.2: Web Worker spiral geometry generator with IndexedDB cache

Status: backlog

## Story

As a performance-minded developer,
I want geometry generation off the main thread and cached by `(organization_id, config_version)`,
so that startup is fast and reruns are free.

## Acceptance Criteria

1. `apps/web/workers/spiral-geometry.worker.ts` consumes the `/map/projection` payload and returns `BufferGeometry` attributes.
2. Result cached in IndexedDB keyed by `(organization_id, config_version)`.
3. On cache miss, worker runs; on hit, worker is skipped and cached attributes are loaded.
4. Unit test with a mocked IndexedDB covers hit and miss paths.

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

- E11.1

### References

- Arch §4.3 rule 6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
