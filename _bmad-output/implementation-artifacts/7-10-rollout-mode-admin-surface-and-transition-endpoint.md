# Story 7.10: Rollout-Mode admin surface and transition endpoint

Status: done (AC3–AC6 shipped; AC1–AC2 deferred as F7-10a)

## Story

As an **ADMIN**, I want to **read and change my organization's rollout mode** (`CALIBRATION` ↔ `ACTIVE`) with mandatory rationale on the forward transition, so that **the entire org is gated through a deliberate, audited cutover that downstream consumers (Map banner / Epic-10, eligibility / Epic-9, promotion workflow / Epic-13) can subscribe to**.

## Acceptance Criteria

### Shipped in this story
3. `GET /v1/organizations/me/promotion-mode` returns `{ promotionMode, changedAt, changedBy }`. Never-transitioned orgs return `changedAt: null` + `changedBy: null` (not a 1970 sentinel, not the caller).
4. `PATCH` transitions the mode. `CALIBRATION → ACTIVE` requires `rationale` ≥ 100 chars (matches Arch §6.2 floor). Same-mode PATCH is a no-op (returns current state without emit).
5. `ACTIVE → CALIBRATION` accepts an optional `rationale`; no re-snapshot (snapshot capture itself is F7-10a).
6. Emits one `organization.promotion_mode.changed` outbox event with `before.fromMode` + `after.toMode` + `reason: rationale`. Audit relay (Story 3-3) persists to `audit_events`; realtime gateway (Epic 5) will fan out the org-wide banner on this event type when E5 wiring lands.

### Deferred as F7-10a
1. **`rollout_mode_transitions` table** (append-only, RLS, CHECK `from_mode <> 'CALIBRATION' OR char_length(rationale) >= 100`) — the audit event still captures every transition's actor + rationale + from/to in `audit_events`, so the trail is queryable; a dedicated table for direct querying without joining audit_events lands with F7-10a.
2. **`bootstrap_eligibility_snapshots` table** + the synchronous one-row-per-employee snapshot capture inside the transition tx — requires Epic-9 scoring core for meaningful `score` / `readiness_pct` / `promotion_eligible` values. Capturing zeros today would poison the historical view.

Both deferrals are registered in `_bmad-output/implementation-artifacts/deferred-work.md` under the Epic-7 section.

## Tasks / Subtasks

- [x] `OrgSettingsService.getPromotionMode` + `transitionPromotionMode` with rationale validation (≥ 100 chars on CALIBRATION → ACTIVE, optional on reverse).
- [x] `PromotionModeController` at `/v1/organizations/me/promotion-mode`, ADMIN-only.
- [x] `emitPromotionModeChanged` audit helper.
- [x] `OrganizationPromotionModeChangedSchema` + `PromotionModeSchema` enum added to `@fcm/domain-contracts`; registered in the discriminated union; sample added to the test taxonomy; `AUDIT_EVENT_TYPES` count bumped from 20 → 21.
- [x] Race-safe (`SELECT ... FOR UPDATE` on org row). Idempotent no-op. Drift detector against `Prisma.PromotionMode`.
- [x] No-op semantics: never-transitioned orgs return null/null (NOT actor / 1970 sentinel) — reviewer M1/M2 fix.
- [x] Tests: 12 service tests + 3 controller-wiring tests.
- [x] Build clean across api + domain-contracts; 475 pass / 3 skip / 0 fail.

## Dev Notes

### Adversarial Review Outcomes

Reviewer found 0 BLOCKER / 2 HIGH / 3 MEDIUM / 5 LOW. Fixed:

- **HIGH H1**: test assertion message claimed "= 20" while asserting size === 21. Updated message to enumerate the 21 event types correctly.
- **HIGH H2**: F7-10a not registered in `deferred-work.md`. Added a comprehensive Epic-7 section covering F7-1a/F7-2a/F7-2b (resolved)/F7-4a/F7-7a/F7-9a/F7-10a.
- **MEDIUM M1/M2/M3**: no-op transition leaked `changedBy: actor.user_id` and `changedAt: 1970` sentinel for never-transitioned orgs. **FIXED** — returns null/null, return type widened to match GET. Regression test pins this.

Not changed (deliberate / informational):
- **LOW L1** (Unicode/grapheme counting): documented in the validator with a comment; floor's intent is "operator effort", not exact char count.
- **LOW L3** (schema accepts `reason: null` even for forward transition): service enforces ≥ 100 at construction; schema-level `.superRefine` is a future hardening pass.
- LOW L4/L5: cosmetic / confirmed correct.

### Architecture Compliance

- §5.4 — row write + audit emit co-commit via `withOrgScope`.
- §6.2 — rationale floor (100 chars) for forward transition matches the architectural commitment.
- AD-6 (realtime) — dedicated event type lets the org-banner consumer subscribe narrowly.

### Dependencies

- E7.1 (configuration module)
- E2.5 (actor context)
- E2.6 (RLS)
- E3.3 (outbox relay)

### Deferred to follow-up

- **F7-10a** — see `deferred-work.md`. Dedicated tables + synchronous bootstrap snapshot capture (needs Epic-9 scoring).

### References

- PRD FR-7.14, §8.9, §6.9
- Arch §5.4, §6.2 (`rollout_mode_transitions` / `bootstrap_eligibility_snapshots`)
- AuditEvent schema: [packages/domain-contracts/src/events/audit.ts#L141](packages/domain-contracts/src/events/audit.ts#L141) (`OrganizationPromotionModeChangedSchema`)
- Schema: [schema.prisma#L101](apps/api/prisma/schema.prisma#L101) (`Organization.promotionMode`)

## Dev Agent Record

### Agent Model Used
Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References
- `pnpm --filter @fcm/domain-contracts test` → 43 pass / 0 fail (schema + taxonomy updated)
- `pnpm --filter @fcm/api run build` → clean
- `pnpm test` → 475 pass / 3 skip / 0 fail (+16 over 7-9 baseline 459+3)
- Adversarial review: 0 BLOCKER / 2 HIGH / 3 MEDIUM / 5 LOW → HIGHs + Ms fixed

### File List
Added
- `apps/api/src/configuration/promotion-mode.controller.ts`
- `apps/api/test/promotion-mode-service.test.mjs`
- `apps/api/test/promotion-mode-controller-wiring.test.mjs`

Modified
- `packages/domain-contracts/src/events/audit.ts` — added `PromotionModeSchema` + `OrganizationPromotionModeChangedSchema`; registered in union + `AUDIT_EVENT_TYPES`
- `packages/domain-contracts/src/events/audit.test.ts` — added sample; bumped count 20 → 21 with explanatory message
- `apps/api/src/configuration/audit.ts` — added `emitPromotionModeChanged` helper
- `apps/api/src/configuration/org-settings.service.ts` — added `getPromotionMode` + `transitionPromotionMode` + validators
- `apps/api/src/configuration/configuration.module.ts` — register `PromotionModeController`
- `_bmad-output/implementation-artifacts/deferred-work.md` — added Epic-7 section covering F7-1a / F7-2a / F7-2b (resolved) / F7-4a / F7-7a / F7-9a / F7-10a
