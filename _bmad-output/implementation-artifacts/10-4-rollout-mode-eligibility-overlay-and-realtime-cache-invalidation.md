# Story 10.4: Rollout-Mode eligibility overlay and realtime cache invalidation

Status: backlog

## Story

As a system,
I want the Map Data Contract to override eligibility state when the org is in `CALIBRATION`,
so that no client path can render a promotion-ready affordance during calibration.

## Acceptance Criteria

1. When `organization.promotion_mode = CALIBRATION`, any node that would compute `eligibility_state = 'ELIGIBLE'` is emitted as `'PENDING_CALIBRATION'`; the override is applied after anonymization.
2. The server applies the state-override hierarchy: Rollout Mode > Calibration Hold > Eligibility; only one state is returned per node.
3. On `organization.promotion_mode.changed` or `config.changed` realtime events, clients receive an invalidation message; on `snapshot.updated`, only the affected node's attributes update (no full re-render).
4. Integration test asserts a `CALIBRATION` org produces zero nodes with `eligibility_state = 'ELIGIBLE'`.

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

- E10.3
- E5.4
- E7.10

### References

- Arch §13.3
- PRD FR-7.13, §6.9, §8.9
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
