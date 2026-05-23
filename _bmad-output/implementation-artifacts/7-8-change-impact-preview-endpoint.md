# Story 7.8: Change-impact preview endpoint

Status: done

## Story

As an **ADMIN** about to commit a destructive configuration change, I want to **see how many of my employees the change will affect (and sample 20 of them)**, so that I **don't accidentally deactivate a track or reshape a level band that still has hundreds of people on it**.

## Acceptance Criteria

1. `POST /v1/configuration/preview-impact` accepts `{ entityType, entityId }` for one of `career_track | level | layer | requirement | promotion_rule` and returns `{ affected_employee_count, sample_employee_ids[<=20] }`. ADMIN-only. Unknown entity → 404; bad shape → 400.
2. **Read-only**: no Prisma writes, no outbox emits, no `$executeRaw` mutations. The test fake traps every Prisma model write so the AC2 guard is real, not aspirational.
3. Active-employees only: `deactivated_at IS NULL` is applied to every count + sample query so ex-employees pinned to the target track/level don't inflate the admin's confirmation.

## Tasks / Subtasks

- [x] `ChangeImpactService` (resolves entity → affected level set or `TRACK` sentinel → employee count + samples).
- [x] `ChangeImpactController` at `POST /v1/configuration/preview-impact`, ADMIN-only.
- [x] Per-kind resolution: track via `career_track_id`, level/layer/requirement/promotion_rule via `level_id = ANY(…)` (single-element ANY for hierarchy parents).
- [x] `deactivated_at IS NULL` filter on every employee query (reviewer BLOCKER fix).
- [x] Safe `bigint → number` coercion in `extractCount` — throws on missing row or value > `MAX_SAFE_INTEGER` rather than silently returning 0 or rounding (reviewer M5 + M6).
- [x] Tests: 14 service tests + 4 controller-wiring tests pinning AC1/AC2/AC3 + deactivated-employee exclusion + safe-integer guard + no-write trap.
- [x] Build clean; 451 pass / 3 skip / 0 fail (+18 over 7-7's 433).

## Dev Notes

### Adversarial Review Outcomes

Reviewer (general-purpose, fresh context) found 1 BLOCKER / 2 HIGH / 4 MEDIUM / 4 LOW. Fixed:

- **BLOCKER #1 (deactivated inflates count)**: every employee query now filters `deactivated_at IS NULL` matching the canonical employee reader. Test pins the SQL contains the filter.
- **MEDIUM #5 (misleading "treat as zero" comment)**: `extractCount` throws on empty result rather than masking a driver failure as "affects 0".
- **MEDIUM #6 (unsafe bigint coercion)**: throws when `COUNT(*) > Number.MAX_SAFE_INTEGER` rather than silently rounding. Test pins this.

Not changed (deliberate):
- **HIGH #2 (RLS audit gap)**: integration-test deferral matches the project-wide pattern (F7-1a/F7-2a). The service uses `withOrgScope` on every read path.
- **HIGH #3 ($queryRaw write detection)**: trapWrite catches Prisma model writes — `$executeRaw` is allowed only for `withOrgScope`'s `SET LOCAL` (the service itself never issues `$executeRaw`).
- **MEDIUM #4 (tx tax)**: read-only `$transaction` is cheap; not worth optimizing pre-Epic-11.
- **MEDIUM #7, LOW #8/9/10/11**: cosmetic / consistent-with-precedent.

### Architecture Compliance

- §5.1 — configuration module ownership.
- §5.4 — read-only single-transaction so the count + sample reflect a consistent snapshot.
- §6.1 — soft-deactivation honored on the read side.

### Dependencies

- E7.4 (Requirements service exists)
- E7.5 (PromotionRules service exists)
- E2.6 (RLS policies on employees + the five configuration tables)

### References

- PRD FR-6.8
- Arch §5.1, §5.4
- Schema: [schema.prisma#L505](apps/api/prisma/schema.prisma#L505) (Employee.deactivatedAt)

## Dev Agent Record

### Agent Model Used
Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References
- `pnpm --filter @fcm/api run build` → clean (after fixing `noUncheckedIndexedAccess` destructure)
- `pnpm test` → 451 pass / 3 skip / 0 fail
- Adversarial review: 1 BLOCKER / 2 HIGH / 4 MEDIUM / 4 LOW → BLOCKER + 2 MEDIUMs fixed

### File List
Added
- `apps/api/src/configuration/change-impact.service.ts`
- `apps/api/src/configuration/change-impact.controller.ts`
- `apps/api/test/change-impact-service.test.mjs`
- `apps/api/test/change-impact-controller-wiring.test.mjs`

Modified
- `apps/api/src/configuration/configuration.module.ts` — register controller + service
