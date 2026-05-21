# Story 13.8: Promotion commit: level change, score archival, node reposition, notifications

Status: backlog

## Story

As a system,
I want a completed promotion to atomically commit the level change and fan out, with all four gates re-verified at commit time,
so that a lapsed eligibility cannot ship a stale promotion.

## Acceptance Criteria

1. **Commit-time re-verification (single transaction, before any mutation):** (a) latest snapshot `promotion_eligible = true`; (b) `organization.promotion_mode = ACTIVE`; (c) no open `calibration_flags` for the employee (`state = 'OPEN'`); (d) approval-chain state is the terminal `APPROVED` for the workflow snapshotted in `promotion_records.workflow_at_initiate`. Any failure rejects with `PROMOTION_NOT_ELIGIBLE` / `ORG_IN_CALIBRATION_MODE` / `CALIBRATION_FLAG_OPEN` / `APPROVAL_CHAIN_INCOMPLETE`, writes an audit event capturing which gate failed, and transitions the record to `REJECTED_AT_COMMIT` so HR can investigate.
2. On successful re-verification, a single transaction: updates `employees.level_id`, resets level-scoped score inputs (next recalc will compute against new level), archives previous snapshot via a `promotion.committed` triggering event, inserts outbox rows for audit + notification + realtime `promotion.completed`.
3. `promotion.completed` event triggers a 3D canvas node-reposition animation client-side.
4. Previous-level score remains in `score_snapshots` history.
5. Integration test covers the full initiate → approve → commit → node-reposition path AND a commit-time-lapse path: simulate (i) a calibration flag opened after final approval but before commit, (ii) a rollout mode flip CALIBRATION between approval and commit, (iii) an evidence retroactive rejection between approval and commit that flips the snapshot's `promotion_eligible` to false. Each must reject at commit with the correct structured error.

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

- E13.7
- E9.5
- E5.4
- E2.5
- E2.6
- E3.3

### References

- PRD FR-7.7, FR-7.8, FR-7.9, §6.5
- Arch §5.4 (Promotion commit transaction includes commit-time re-verification of all four gates)
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
