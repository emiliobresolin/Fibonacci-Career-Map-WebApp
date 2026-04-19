# Story 6.2: Configuration tables: tracks, levels, layers, requirements, promotion_rules

Status: backlog

## Story

As an engineer,
I want the configuration schema as data (not code),
so that every dimension in PRD §8 is org-editable.

## Acceptance Criteria

1. Migrations create `career_tracks`, `levels` (with non-overlapping band exclusion constraint), `layers`, `requirements`, `promotion_rules` per Arch §6.2.
2. All tables are `organization_id`-scoped with RLS.
3. A repository per table exists in the `configuration` module; no direct DB access outside it.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E2.6
- E6.1

### References

- Arch §5.1, §6.2
- PRD §8
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
