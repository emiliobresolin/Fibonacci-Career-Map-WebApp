# Story 3.4: Event-type taxonomy and AuditEvent payload contract in `domain-contracts`

Status: backlog

## Story

As a developer,
I want formal TypeScript types for every audit event,
so that emitters and consumers agree on shape.

## Acceptance Criteria

1. `packages/domain-contracts/events/` defines discriminated-union types covering every event listed in PRD §10.1 (evidence, score, configuration, promotion, role, visibility, approval-workflow).
2. Each event type includes `event_id`, `occurred_at`, `actor_id`, `organization_id`, `entity_type`, `entity_id`, and event-specific `before`/`after`/`reason` fields.
3. A shared Zod (or equivalent) validator matches each type; runtime validation runs in the relay worker before persisting.
4. Unit tests assert round-trip encode/decode and reject malformed payloads.

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

- E3.3

### References

- Arch §5.1 audit module
- PRD §10.1
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
