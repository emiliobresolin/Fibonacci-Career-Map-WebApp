# Story 16.3: Runbooks

Status: backlog

## Story

As an on-call engineer,
I want written runbooks for the top incident classes.

## Acceptance Criteria

1. `docs/ops/runbooks/` contains runbooks for: recalc-backlog, outbox-relay-stuck, oidc-outage, 3d-fps-crater, presigned-url-failure, rls-deny-all.
2. Each runbook: symptom checklist, dashboards to open, mitigation steps, escalation path.
3. Runbook links match the alert links from E16.2.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E16.2

### References

- Arch §11.6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
