# Story 6.2a: Employees and employee_assignments tables

Status: backlog

## Story

As an engineer,
I want the core `employees` and `employee_assignments` tables,
so that every downstream domain has the entity its FKs reference.

## Acceptance Criteria

1. Migration creates `employees(id UUID PK, organization_id UUID FK NOT NULL, user_id UUID FK NOT NULL, track_id UUID FK, level_id UUID FK, assigned_at TIMESTAMPTZ, deactivated_at TIMESTAMPTZ NULL, created_at, updated_at)` with RLS enabled and `(organization_id, user_id)` uniqueness.
2. Migration creates `employee_assignments(id UUID PK, employee_id UUID FK NOT NULL, organization_id UUID FK NOT NULL, role role_enum NOT NULL, manager_employee_id UUID FK NULL, assigned_at TIMESTAMPTZ, deactivated_at TIMESTAMPTZ NULL)` with RLS and partial unique index `(employee_id, organization_id, role) WHERE deactivated_at IS NULL`.
3. A `BEFORE INSERT/UPDATE` trigger on `employee_assignments` rejects self-management (`employee_id = manager_employee_id`).
4. A repository (`EmployeesRepository`) is exposed in the `identity` module; no other module accesses the table directly.
5. Unit test covers RLS isolation (org-A cannot read org-B's employees), self-management rejection, and uniqueness violation.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4
- [ ] Task covering AC #5

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E6.2
- E2.6

### References

- Arch §6.2 (`employees`, `employee_assignments`)
- PRD §4.2, §6.1
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
