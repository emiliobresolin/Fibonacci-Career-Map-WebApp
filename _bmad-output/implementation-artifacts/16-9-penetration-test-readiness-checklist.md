# Story 16.9: Penetration-test readiness checklist

Status: backlog

## Story

As an enterprise buyer,
I want a pen-test-ready posture documented even though the test itself is post-MVP.

## Acceptance Criteria

1. `docs/security/pen-test-readiness.md` catalogs: auth flows, RBAC layer map, data classification, evidence file access control, audit reproduction, rate-limit posture, known non-goals.
2. OWASP Top 10 self-assessment completed and linked.
3. A named owner sign-off recorded.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E1.9
- E2.6
- E8.3

### References

- Arch §12.6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
