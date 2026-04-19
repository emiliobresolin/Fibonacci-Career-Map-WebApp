# Story 8.5: Admin/HR override approval path

Status: backlog

## Story

As an Admin,
I want to approve or reject evidence for any employee (for gaps or escalations).

## Acceptance Criteria

1. Same endpoints as E8.4 accept ADMIN role with a separate `allow_admin_override` authorization pass; ADMIN cannot self-approve their own evidence.
2. The audit event's `actor_role` is set to ADMIN so HR investigations can distinguish override paths.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E8.4

### References

- PRD FR-4.6
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
