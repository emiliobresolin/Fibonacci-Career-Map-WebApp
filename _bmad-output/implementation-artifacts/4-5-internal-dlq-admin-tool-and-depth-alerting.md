# Story 4.5: Internal DLQ admin tool and depth alerting

Status: backlog

## Story

As an on-call operator,
I want to inspect and re-enqueue DLQ jobs without writing one-off scripts.

## Acceptance Criteria

1. An admin-role-gated UI at `/settings/ops/dlq` lists DLQ depth per queue, the last N failed jobs, failure reasons, and a one-click "re-enqueue" action.
2. A server-side endpoint enforces ADMIN role and writes an audit event on each re-enqueue action.
3. Prometheus alert rule documented in this story (rule itself shipped by E16): `fcm_dlq_depth > 0 for 5m` → page.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E4.1
- E4.2

### References

- Arch §7.6, §11.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
