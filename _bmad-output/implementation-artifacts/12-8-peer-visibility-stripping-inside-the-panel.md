# Story 12.8: Peer-visibility stripping inside the panel

Status: backlog

## Story

As an Employee viewing a peer node I am permitted to see,
I want Score, ETA, Confidence, and Development Notes never to appear.

## Acceptance Criteria

1. When viewer is EMPLOYEE and target is a peer under `TEAM` visibility, the panel renders only name, level, track, and summary status (no score/ETA/confidence/notes).
2. Server-side DTO from `/v1/employees/:id/panel` (new, thin) strips fields the viewer is not entitled to see; client trusts the DTO.
3. Integration test asserts no forbidden fields leak across the API boundary.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E12.4
- E7.6

### References

- PRD FR-3.17
- Arch §13.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
