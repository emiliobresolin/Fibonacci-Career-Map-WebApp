# Story 10.2: `GET /v1/map/employees` server-shaped payload

Status: backlog

## Story

As a frontend developer,
I want the map node data shaped server-side with RBAC applied,
so that the client is never trusted to hide data.

## Acceptance Criteria

1. Endpoint returns `{ nodes: [...] }` matching the `MapNode` contract (Arch §13.3): `employee_id` (nullable), `track_id`, `level_id`, `band_position` (0–1), `score` (nullable), `readiness_pct` (nullable), `promotion_eligible` (nullable), `eligibility_state`, `at_risk` (nullable), `anonymized`.
2. Filter scope: Managers default to "My Team" (FR-2.15); `?scope=org` toggles off the default; ADMIN sees all.
3. Values come from `employee_current_snapshot`; no recomputation.
4. Response includes headers `X-FCM-Rollout-Mode` and `X-FCM-Visibility-Scope`.

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

- E9.4
- E10.1
- E2.6

### References

- Arch §13.3
- PRD FR-2.15, §14.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
