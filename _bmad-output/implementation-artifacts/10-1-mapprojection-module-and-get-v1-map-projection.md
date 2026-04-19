# Story 10.1: mapprojection module and `GET /v1/map/projection`

Status: backlog

## Story

As a frontend developer,
I want the spiral projection data for the current config,
so that the Web Worker can regenerate geometry deterministically.

## Acceptance Criteria

1. `MapProjectionService` is a pure function: `(organizationConfig) → { tracks[], levels[], layers[], seed_parameters }`.
2. `GET /v1/map/projection` returns this payload plus `config_version` for client caching.
3. Response headers include `X-FCM-Config-Version`; cache-key is `(organization_id, config_version)`.
4. Unit test with a fixed configuration asserts deterministic output.

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

- E7.1–E7.3

### References

- Arch §5.1 mapprojection, §13.2
- Epics E10
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
