# Story 11.7: Promotion-Ready pulse and readiness encoding with `prefers-reduced-motion` fallback

Status: backlog

## Story

As a user,
I want clear visual signals for promotion eligibility and readiness that respect accessibility preferences.

## Acceptance Criteria

1. Emissive pulse shader uniform drives a subtle pulse; binding is `promotion_eligible === true`, never `readiness_pct`.
2. When `prefers-reduced-motion` is set, pulse is replaced with a static ring halo.
3. Per-instance opacity + emissive blended from `readiness_pct`; clamped at 40% opacity minimum so 0% nodes remain clickable.
4. Single bloom post-processing pass on the emissive channel.

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

- E11.3

### References

- PRD §14.3, FR-2.6, FR-7.2
- Arch §4.3 rules 7–10
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
