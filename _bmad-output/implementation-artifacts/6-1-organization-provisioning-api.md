# Story 6.1: Organization provisioning API

Status: backlog

## Story

As an Admin,
I want a one-shot provisioning endpoint,
so that a new organization appears in FCM with correct defaults.

## Acceptance Criteria

1. `POST /v1/organizations` creates an organization with `slug`, `name`, default `visibility_default = OWN_ONLY`, `approval_workflow_default = SINGLE`, `promotion_mode = CALIBRATION`.
2. The endpoint is restricted to a privileged internal role (not tenant Admin); it is called by bootstrap tooling, not by end users.
3. A successful call emits an `organization.created` audit event via the outbox.
4. Integration test asserts defaults match PRD §14.2, §14.8, §8.7.

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

- E2.6
- E3.3

### References

- Arch §5.1, §5.4
- PRD §14.2, §14.8
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
