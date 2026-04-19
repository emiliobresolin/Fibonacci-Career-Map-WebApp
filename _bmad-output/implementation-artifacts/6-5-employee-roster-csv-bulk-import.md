# Story 6.5: Employee roster CSV bulk import

Status: backlog

## Story

As an Admin,
I want to import a roster CSV,
so that I don't have to add employees one by one.

## Acceptance Criteria

1. `POST /v1/employees/bulk-import` accepts a CSV with `email`, `display_name`, `track_slug`, `level_code`, `manager_email`.
2. Dry-run mode (`?dryRun=true`) validates and returns a per-row preview without writing.
3. Commit mode creates users (stub profile until first SSO login), employee assignments, and role_assignments; every row produces an audit event.
4. Validation errors return a structured report: row index, field, reason.
5. An integration test covers 10 valid rows and 3 invalid rows; all side-effects roll back on commit failure.

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

- E6.3

### References

- PRD §6.1, FR-NFR-8.1
- Arch §13.5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
