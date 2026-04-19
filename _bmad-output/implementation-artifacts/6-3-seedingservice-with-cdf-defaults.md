# Story 6.3: SeedingService with CDF defaults

Status: backlog

## Story

As an Admin bootstrapping a new org,
I want the CDF defaults seeded,
so that employees can appear on the map on day one.

## Acceptance Criteria

1. `SeedingService.seedOrganization(organization_id)` creates Software Engineering L1–L5, Architecture L4–L5, Management L3–L5; Capability/Delivery/Influence layers per level; a representative requirement per layer with Fibonacci weights (1, 2, 3, 5, 8, 13, 21); default promotion rules; `visibility_default = OWN_ONLY`; `approval_workflow_default = SINGLE`; `promotion_mode = CALIBRATION`.
2. Seed is idempotent: re-running against an already-seeded org throws `AlreadySeededError` without mutating data.
3. Every seeded row emits a `configuration.seeded` audit event via the outbox.
4. Unit test covers the full seeded state.

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

- E6.2

### References

- PRD §6.1, §8
- Epics §4 E6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
