# Story 7.5: Promotion Rules CRUD per level

Status: done

## Story

As an **ADMIN**, I want to **read, create, and update the single Promotion Rule attached to each Level**, so that **the Epic-9 eligibility evaluator has a configurable, audited contract that gates Promotion Eligibility per level**.

## Acceptance Criteria

> Field naming note: the SQL columns (and therefore the wire DTO) are camelCase derivatives of the column names — `mandatoryCompletion` / `managerRequired` / `hrRequired` / `blockerCheck`. The original spec used longer descriptive names; this canonicalization happened during 6-2 schema design and the wire was deliberately aligned to the columns to keep audit payloads and DB rows isomorphic.

1. `GET /v1/levels/:levelId/promotion-rule`, `POST /v1/levels/:levelId/promotion-rule`, `PATCH /v1/levels/:levelId/promotion-rule`; ADMIN-only on writes. **No DELETE endpoint** — a level cannot exist without its rule. Unknown `levelId` → 404; level exists but no rule yet → 404 with a distinct message.
2. Fields: `minScore` (non-negative integer ≤ 1,000,000), `minTimeAtLevelMonths` (null or non-negative integer ≤ 600 — matches DB CHECK `IS NULL OR >= 0`), `mandatoryCompletion` BOOL, `managerRequired` BOOL, `hrRequired` BOOL, `blockerCheck` BOOL. Defaults at create (when caller omits): mandatoryCompletion=true, managerRequired=true, hrRequired=false, blockerCheck=true. Boolean gates reject non-boolean input (no truthiness coercion).
3. Every mutation emits one `configuration.changed` outbox event via the shared helper with `configEntityType: 'promotion_rule'`. P2002 on `level_id` → 409 (race-safe via the unique index); P2025 on update (race with delete-recreate) → 409.

## Tasks / Subtasks

- [x] `PromotionRulesService` + `PromotionRulesController` registered in `configuration.module.ts`.
- [x] Singular resource route `/v1/levels/:levelId/promotion-rule` (no rule-id route surface).
- [x] No `delete`/`remove`/`destroy`/`deactivate` method on either service or controller (pinned by tests).
- [x] DB CHECK alignment: `minTimeAtLevelMonths` accepts `0` (validator and test updated to match `promotion_rules_min_time_nonneg`).
- [x] P2025 → 409 translation on update (narrow concurrent delete-recreate window).
- [x] Tests: 18 service tests + 5 controller-wiring tests including PRD-default pin, boolean-no-coercion, schema-validated audit shape, "no DELETE" guards.
- [x] Build clean; 408 pass / 3 skip / 0 fail (+19 over 7-4's 389).

## Dev Notes

### Adversarial Review Outcomes

Reviewer (general-purpose, fresh context) found 0 BLOCKER / 2 HIGH / 3 MEDIUM / 5 LOW. Fixed:

- **HIGH H1**: validator rejected `minTimeAtLevelMonths: 0` while DB CHECK allows `IS NULL OR >= 0`. **FIXED** — validator now mirrors the constraint exactly. Test updated to accept 0 as legitimate "no tenure floor" input.
- **HIGH H2**: spec named fields `mandatory_completion_required` / `manager_approval_required` / etc.; wire uses `mandatoryCompletion` / `managerRequired` / etc. (matching SQL columns). **DOCUMENTED** — story spec rewritten with a note acknowledging the column-name canonicalization that happened during 6-2 and explaining why wire matches DB.
- **LOW L2**: P2025 during update under concurrent delete-recreate would surface as 500. **FIXED** — translated to 409 with a "re-fetch and retry" message.

Not changed (deliberate):
- M1 (empty-PATCH leaks 404 semantics): documented behavior; cheap to live with.
- M2 (double-tx on GET): premature optimization; Epic 9 evaluator will likely cache anyway.
- M3 (no convention guard for sibling `/v1/promotion-rules/:id` controller): the file doesn't exist; adding a defensive grep test would be brittle.
- L1, L3, L4, L5: confirmed safe / cosmetic.

### Architecture Compliance

- §5.1 — owned by configuration module.
- §5.4 — row write + audit emit co-commit via `withOrgScope`.
- §6.2 — `promotion_rules.level_id` is unique (1:1 with Level); race-safe via DB constraint, not app-layer guards.

### Dependencies

- E7.2 (Levels)
- E2.6 (RLS)
- E3.3 (outbox relay)

### References

- PRD FR-6.5, §8.5
- Arch §5.1, §5.4, §6.2
- Schema: [schema.prisma#L447](apps/api/prisma/schema.prisma#L447)
- Migration: [20260528000000_configuration_tables/migration.sql#L189](apps/api/prisma/migrations/20260528000000_configuration_tables/migration.sql#L189)

## Dev Agent Record

### Agent Model Used

Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References

- `pnpm --filter @fcm/api run build` → clean
- `pnpm test` → 408 pass / 3 skip / 0 fail (+19 over 7-4)
- Adversarial review: 0 BLOCKER / 2 HIGH / 3 MEDIUM / 5 LOW → HIGHs + L2 fixed

### File List

Added
- `apps/api/src/configuration/promotion-rules.service.ts`
- `apps/api/src/configuration/promotion-rules.controller.ts`
- `apps/api/test/promotion-rules-service.test.mjs`
- `apps/api/test/promotion-rules-controller-wiring.test.mjs`

Modified
- `apps/api/src/configuration/configuration.module.ts` — register controller + service
