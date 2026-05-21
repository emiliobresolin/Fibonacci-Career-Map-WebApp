# Story 11.7: Promotion-Ready pulse and readiness encoding with `prefers-reduced-motion` fallback

Status: backlog

## Story

As a user,
I want clear visual signals for promotion eligibility and readiness that respect accessibility preferences.

## Acceptance Criteria

1. Emissive pulse shader uniform drives a subtle pulse; binding is `promotion_eligible === true`, never `readiness_pct`.
2. **Contract test (Vitest + react-three-test-renderer):** a unit test reads the actual `uniforms` object on the pulse `ShaderMaterial` at mount time and asserts `uniforms.uPulseTrigger.value` is derived from a `promotion_eligible` selector and that no path in the source binds `readiness_pct` to `uPulseTrigger`. The test imports the production shader/material and fails if the binding source field is changed by future refactors. A second snapshot test renders one eligible + one ineligible + one high-readiness-but-ineligible node and asserts the pulse uniform value is `1.0`, `0.0`, and `0.0` respectively.
3. **Lint rule (eslint-plugin-fcm or equivalent local rule):** scans the 3D rendering package and fails the build if any shader or material assignment of the form `uPulseTrigger = ...readiness...` appears in source. This is defense-in-depth against the contract-test failure mode where a developer adds a new binding path the test doesn't cover.
4. When `prefers-reduced-motion` is set, pulse is replaced with a static ring halo.
5. Per-instance opacity + emissive blended from `readiness_pct`; clamped at 40% opacity minimum so 0% nodes remain clickable (and an OWN_ONLY peer at readiness=0% still renders with the same opacity floor — anonymization does not bypass the floor).
6. Single bloom post-processing pass on the emissive channel.

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

- E11.3

### References

- PRD §14.3, FR-2.6, FR-7.2 (Promotion-Ready signal MUST bind to Eligibility, never Readiness — failure here is a PRD §7.1 product-credibility failure)
- Arch §4.3 rules 7–10
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
