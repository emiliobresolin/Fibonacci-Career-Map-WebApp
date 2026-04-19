# Story 11.3: InstancedMesh employee nodes with per-instance attributes

Status: backlog

## Story

As a frontend developer,
I want nodes rendered via a single InstancedMesh,
so that 500+ employees render with one draw call.

## Acceptance Criteria

1. Node layer is a single `<InstancedMesh>` sized to the current cohort.
2. Per-instance attributes: `color` (level), `opacity`, `emissiveIntensity`, `pulsePhase` passed via `InstancedBufferAttribute`.
3. Updating a node's attributes on a realtime event mutates the buffer in place (no full re-render).
4. Level color coding: L1 blue, L2 teal, L3 purple, L4 tan, L5 silver.

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

- E11.2
- E10.2

### References

- Arch §4.3 rule 2, FR-2.4, FR-2.5, §14.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
