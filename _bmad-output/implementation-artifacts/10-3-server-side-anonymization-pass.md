# Story 10.3: Server-side anonymization pass

Status: backlog

## Story

As a security-minded engineer,
I want anonymization enforced server-side,
so that the client never receives identity for peers it cannot see.

## Acceptance Criteria

1. For each node, a `should_reveal(viewer, subject)` authorization pass decides reveal vs. anonymize per the org's visibility rule (E7.6).
2. Anonymized nodes emit `employee_id = null` (replaced by an opaque per-render token), `anonymized = true`, `score/readiness_pct/promotion_eligible/at_risk = null`; `track_id/level_id/band_position` remain populated so shape is preserved; node is marked non-clickable server-side via a `clickable: false` hint.
3. Integration tests:
4. `OWN_ONLY` viewer receives only their own identified node.
5. `TEAM` viewer receives identified nodes only for direct team members.
6. `ORG_SUMMARY` returns only aggregate counts (no individual nodes).

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

- E10.2
- E7.6

### References

- PRD §8.6, §14.2, FR-3.17
- Arch §13.3, AR-13
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
