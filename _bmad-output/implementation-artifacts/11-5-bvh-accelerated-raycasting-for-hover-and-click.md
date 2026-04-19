# Story 11.5: BVH-accelerated raycasting for hover and click

Status: backlog

## Story

As a user,
I want smooth hover feedback and clean click targets.

## Acceptance Criteria

1. `three-mesh-bvh` wraps the node InstancedMesh.
2. Hover uses a throttled 60 Hz raycast; click fires a single raycast on pointer-up.
3. Anonymized nodes (from E10.3) do not accept click; hover shows no tooltip.
4. Missed click (empty area) deselects the current node.

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

- E11.3

### References

- Arch §4.3 rule 5
- FR-2.9, FR-2.10
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
