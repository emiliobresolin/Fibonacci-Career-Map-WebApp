# Story 16.7: Cross-tenant regression suite and pre-signed URL scope tests

Status: backlog

## Story

As a team,
I want automated proof that tenant isolation holds as new repositories are added.

## Acceptance Criteria

1. A test harness seeds two orgs per test; every repository added by domain epics includes at least one dual-org cross-read assertion in its test suite.
2. Pre-signed URL tests: an evidence URL issued under org-A's key cannot fetch bytes stored under org-B's key.
3. CI enforces presence of the dual-org assertion via a lint rule on repository-test files.

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
- E8.3

### References

- Arch §17 AR-4, AR-5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
