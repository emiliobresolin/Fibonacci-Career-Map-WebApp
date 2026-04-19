# Story 15.6: Bootstrap Eligibility Snapshot explorer (2D, HR)

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `/analytics/bootstrap-snapshots` (HR only) lists transitions; selecting a transition renders per-employee snapshot rows with current-state comparison.
2. Export the full snapshot as CSV for compliance.
3. Data sourced from `bootstrap_eligibility_snapshots` and `rollout_mode_transitions` (E7.10).

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E7.10

### References

- PRD FR-10.6, §8.9
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
