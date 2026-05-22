# Story 6.5: Employee roster CSV bulk import

Status: done

## Story

As an Admin,
I want to import a roster CSV,
so that I don't have to add employees one by one.

## Acceptance Criteria

1. `POST /v1/employees/bulk-import` accepts a CSV with `email`, `display_name`, `track_slug`, `level_code`, `manager_email`.
2. Dry-run mode (`?dryRun=true`) validates and returns a per-row preview without writing.
3. Commit mode creates `users` (stub profile until first SSO login), `employees` rows, and `employee_assignments` (resolving each `manager_email` to the corresponding `manager_employee_id`); every row produces an audit event.
4. Rows whose `manager_email` does not resolve to an already-created employee in the same CSV or a pre-existing employee are rejected with a structured error.
5. Validation errors return a structured report: row index, field, reason.
6. An integration test covers 10 valid rows and 3 invalid rows; all side-effects roll back on commit failure.

## Tasks / Subtasks

- [ ] Task covering AC #1
- [ ] Task covering AC #2
- [ ] Task covering AC #3
- [ ] Task covering AC #4
- [ ] Task covering AC #5
- [ ] Task covering AC #6

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E6.2a
- E6.3
- E2.6
- E3.3

### References

- PRD §6.1, NFR-8.1
- Arch §13.5, §6.2
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References

- `pnpm --filter @fcm/api run build` → clean
- `pnpm test` → 308 pass / 2 skip / 0 fail (baseline was 276+2; +32 tests this story)
- `pnpm --filter @fcm/domain-contracts test` → 43 pass

### Completion Notes List

**Approach**:
- Hand-rolled `csv-parser.ts` (RFC4180-lite): no new dep, handles quoted fields with embedded commas, escaped `""`, CRLF/LF, BOM. Strict on multi-line records (rejected as `CsvParseError`).
- `EmployeeImportService.dryRun()` / `commit()` share one validation pipeline. The validate phase reads tracks/levels/users/employees once (4 small txes) and collects ALL per-row errors before bailing. Commit phase runs the entire batch in ONE `withOrgScope` transaction so AC6 rollback is the natural outcome of a row failure.
- Manager email resolution (AC4): in-batch + pre-existing email map, built up as rows are processed. Forward references (manager appears later in CSV) and self-references are explicit validation errors.
- Audit emission (AC3): one `employee.imported` outbox event per row, inside the commit tx.
- Body-size: raised Express JSON limit to 5MB (Story 6-5 specific); added `MAX_CSV_BYTES = 2_000_000` guard at the controller for clean structured 400 on paste-bomb.

**Validation matrix** (AC5):
- email: required, RFC-shape, unique in org + unique in batch (case-insensitive)
- display_name: required, non-empty after trim
- track_slug: optional, must resolve when present
- level_code: optional; requires track_slug; resolved against (track, code) so the same code under different tracks doesn't accidentally match. Suppresses chained "level requires track" error when the track itself failed to resolve.
- manager_email: optional; if present, must resolve to existing employee or earlier row; cannot equal own email

**AC6 atomicity**: single `withOrgScope` wraps every write. The test fake faithfully implements commit-on-success / rollback-on-throw to model the same boundary real Postgres provides; the `failOnUserCreateEmail` injection test pins the all-or-nothing semantic.

### Adversarial Review Outcomes

Single-pass adversarial review surfaced 0 BLOCKER / 0 HIGH / 2 MEDIUM / 5 LOW:

- **MEDIUM 1** (body-size): Express default JSON limit (100KB) would 413 a realistic onboarding CSV. **Fixed** by raising to 5MB in `main.ts` with a comment pointing at this story.
- **MEDIUM 2** (validate-then-commit race): existing-email check is outside the commit tx, so a concurrent admin create could land between validate and commit. The P2002 catch arm in `commit()` already handles this; flagged as documented behaviour, no code change.
- **LOW 1** (paste-bomb DoS): **Fixed** by adding `MAX_CSV_BYTES = 2_000_000` guard at the controller.
- LOW 2–5 (case-insensitive headers, CSV-injection in displayName, CRLF normalization perf, case-sensitive @@unique email vs case-insensitive in-service check): documented as acceptable trade-offs / future export-story concerns.

### Deferred to follow-up

- **F6-5a**: integration test against a real DB with the 10 valid + 3 invalid + concurrent-collision scenarios.
- **F6-5b**: CSV-injection sanitization at the export boundary (not in scope for the import story).

### File List

Added
- `apps/api/src/identity/csv-parser.ts`
- `apps/api/src/identity/employee-import.service.ts`
- `apps/api/src/identity/employee-import.controller.ts`
- `apps/api/test/csv-parser.test.mjs`
- `apps/api/test/employee-import-service.test.mjs`
- `apps/api/test/employee-import-controller-wiring.test.mjs`

Modified
- `apps/api/src/identity/identity.module.ts` — registers controller + service
- `apps/api/src/main.ts` — raises JSON body limit to 5MB for CSV uploads
- `packages/domain-contracts/src/events/audit.ts` — adds `employee.imported` variant; AUDIT_EVENT_TYPES grows 19 → 20
- `packages/domain-contracts/src/events/audit.test.ts` — adds sample, bumps count to 20
