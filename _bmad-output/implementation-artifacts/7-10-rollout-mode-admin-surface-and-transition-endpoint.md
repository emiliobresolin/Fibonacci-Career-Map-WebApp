# Story 7.10: Rollout-Mode admin surface and transition endpoint

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. Migration creates `rollout_mode_transitions(id UUID PK, organization_id UUID FK, actor_id UUID FK, from_mode promotion_mode_enum, to_mode promotion_mode_enum, rationale TEXT NULL, transitioned_at TIMESTAMPTZ NOT NULL, CHECK (from_mode <> 'CALIBRATION' OR char_length(rationale) >= 100))` with RLS, append-only.
2. Migration creates `bootstrap_eligibility_snapshots(id UUID PK, organization_id UUID FK, transition_id UUID FK to rollout_mode_transitions, employee_id UUID FK, level_id UUID FK, score INT, readiness_pct NUMERIC, promotion_eligible BOOL, calibration_flag_open BOOL, occurred_at TIMESTAMPTZ NOT NULL)` with RLS, append-only, partitioned by `RANGE (occurred_at)` quarterly; unique `(transition_id, employee_id)`.
3. `GET /v1/organizations/me/promotion-mode` returns `{ promotion_mode, changed_at, changed_by }`.
4. `PATCH` transitions the mode; `CALIBRATION → ACTIVE` requires `rationale` ≥100 chars and triggers synchronous Bootstrap Eligibility Snapshot capture (one row per employee in the org) in the same transaction.
5. `ACTIVE → CALIBRATION` is allowed with rationale; does not re-snapshot.
6. Emits `organization.promotion_mode.changed` realtime event via outbox; audit event captures actor, rationale, from/to.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4
- [ ] Task covering AC #5
- [ ] Task covering AC #6

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E7.1
- E6.2a
- E2.5
- E2.6
- E3.3

### References

- PRD FR-7.14, §8.9, §6.9
- Arch §5.4, §6.2 (`rollout_mode_transitions`, `bootstrap_eligibility_snapshots`)
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
