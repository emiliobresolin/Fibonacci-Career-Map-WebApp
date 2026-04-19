# Story 5.4: Outbound event filter and event-type contract

Status: backlog

## Story

As a system,
I want every outbound event filtered per recipient,
so that a manager never receives unfiltered data about non-reports.

## Acceptance Criteria

1. A per-connection outbound middleware prunes event payloads by the recipient's visibility rule before emission.
2. Event-type contracts live in `packages/domain-contracts/realtime-events/`: `snapshot.updated`, `evidence.*`, `promotion.*`, `recalc.*`, `config.changed`, `organization.promotion_mode.changed`.
3. Emitters land in later epics; this story ships only the contracts, filter, and smoke test.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E5.3

### References

- Arch §8.3, §8.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
