# Story 2.1: Identity schema: users, organizations, role_assignments

Status: backlog

## Story

As an engineer,
I want the identity schema in Prisma,
so that authentication and RBAC have a data model.

## Acceptance Criteria

1. Migration creates `organizations` (slug, name, OIDC config JSONB, `visibility_default`, `approval_workflow_default`, `promotion_mode` enum default `CALIBRATION`, `promotion_mode_changed_at`, `promotion_mode_changed_by`), `users` (email, display_name, FK to `organizations`), and `role_assignments` (`user_id`, `organization_id`, `role` enum EMPLOYEE/MANAGER/ADMIN) with a unique constraint on `(user_id, organization_id, role)`.
2. All tables carry `organization_id NOT NULL` where applicable and are indexed on it.
3. A seed script creates one dev organization, one ADMIN user, and one EMPLOYEE user for local development only.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E1.4

### References

- Arch §6.2, §10.2
- FR-1.4
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
