# Story 7.10: Rollout-Mode admin surface and transition endpoint

Status: backlog

## Story

As a TBD,
I want TBD.

## Acceptance Criteria

1. `GET /v1/organizations/me/promotion-mode` returns `{ promotion_mode, changed_at, changed_by }`.
2. `PATCH` transitions the mode; `CALIBRATION → ACTIVE` requires `rationale` ≥100 chars and triggers synchronous Bootstrap Eligibility Snapshot capture in the same transaction (see E13 for snapshot content — table is provisioned here so the transition is atomic).
3. `ACTIVE → CALIBRATION` is allowed with rationale; does not re-snapshot.
4. Emits `organization.promotion_mode.changed` realtime event via outbox; audit event captures actor, rationale, from/to.

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

- E7.1
- E13.2 (table provisioning is owned by this story for transactional atomicity — see note below)

### References

- PRD FR-7.14, §8.9, §6.9
- Arch §5.4, §6.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
