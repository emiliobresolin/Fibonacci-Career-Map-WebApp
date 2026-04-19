# Story 11.4: 3-tier LOD with clustering and frustum/occlusion culling

Status: backlog

## Story

As a performance-minded developer,
I want LOD and culling,
so that the 60 fps / 500-node budget holds.

## Acceptance Criteria

1. Near tier: full detail + labels.
2. Mid tier: instanced spheres, no labels, simplified materials.
3. Far tier: clustered aggregate billboards per `(track, level)` with count glyph; threshold default 12, configurable.
4. Frustum culling + track-segment occlusion pass implemented; off-frustum segments skip instance updates.
5. FPS measured at 500-node synthetic test ≥30 fps sustained (target 60).

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4
- [ ] Task covering AC #5

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E11.3

### References

- Arch §4.3 rules 3–4
- NFR-1.1
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
