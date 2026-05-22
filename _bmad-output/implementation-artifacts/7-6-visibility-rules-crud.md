# Story 7.6: Visibility Rules CRUD

Status: done

## Story

As an **ADMIN**, I want to **read and update my organization's default visibility setting** (one of `OWN_ONLY` / `TEAM` / `ORG_SUMMARY` / `ORG_FULL`), so that **the Map Data Contract (Epic 10) and the per-employee detail panel (Epic 12) gate non-self data based on the org's chosen posture**.

## Acceptance Criteria

1. `GET /v1/organizations/me/visibility` and `PATCH /v1/organizations/me/visibility` (both ADMIN-only). Validates against the four-value Prisma `VisibilityDefault` enum (derived at runtime — drift-safe).
2. PATCH emits one `visibility_rule.changed` outbox event with `before.fromSetting` + `after.toSetting`. The Map Data Contract (Epic 10) subscribes narrowly to this event type to invalidate cached projections; the relay (Story 3-3) consumes the same row for audit.
3. Audit event matches the `VisibilityRuleChangedSchema` shape from `@fcm/domain-contracts`. PATCH to the same value is a no-op (no DB write, no audit emit, no map-cache invalidation event).

## Tasks / Subtasks

- [x] `OrgSettingsService` (storage on `organizations.visibility_default` enum column).
- [x] `OrgSettingsController` at `/v1/organizations/me/visibility`; both endpoints ADMIN-only.
- [x] `emitVisibilityRuleChanged` helper added to `audit.ts` — different audit shape from `configuration.changed`, dedicated event type for narrow Epic-10 subscription.
- [x] Reviewer B1 race fix: `SELECT ... FOR UPDATE` on the org row inside the tx so two concurrent PATCHes serialize.
- [x] Reviewer H1 fix: `getVisibility` runs inside `withOrgScope` for RLS defense-in-depth.
- [x] Reviewer M2 fix: empty PATCH body returns `visibilityDefault is required` (not the enum-list error).
- [x] Tests: 10 service tests + 3 controller-wiring tests, including row-lock-before-read pin, drift detector, idempotent no-op pin, schema-validated audit shape.
- [x] Build clean; 420 pass / 3 skip / 0 fail (+12 over 7-5's 408).

## Dev Notes

### Adversarial Review Outcomes

Reviewer (general-purpose, fresh context) found 1 BLOCKER / 2 HIGH / 3 MEDIUM / 3 LOW. Fixed:

- **BLOCKER B1**: two concurrent OWN_ONLY→ORG_FULL PATCHes would both read `before=OWN_ONLY`, both update, both emit. **FIXED** with `SELECT id FROM organizations WHERE id = $1 FOR UPDATE` inside the tx before the read.
- **HIGH H1**: `getVisibility` bypassed `withOrgScope`. **FIXED** — wrapped in `withOrgScope` so the RLS GUC is set, defense-in-depth even though `where: {id: orgId}` already filters.
- **MEDIUM M2**: empty PATCH body produced "must be one of …" instead of "required". **FIXED** in the controller before reaching the validator.

Not changed (deliberate):
- **HIGH H2** (relay-path candidate construction): every service test in this codebase constructs the audit candidate manually; refactoring all of them to share the relay's construction is a separate cross-story cleanup.
- **MEDIUM M1** (return shape asymmetry): GET/PATCH return `{ visibilityDefault }` only; the org row is not exposed by AC.
- **MEDIUM M3** (drift detector vs `VisibilitySettingSchema`): the runtime drift-detector against `Prisma.VisibilityDefault` is sufficient — schema-side drift would land in a separate failure.
- LOW items: cosmetic or addressed.

### Architecture Compliance

- §5.1 — `OrgSettingsService` owned by configuration module.
- §5.4 — row write + audit emit co-commit via `withOrgScope`.
- §8.6 / §14.2 — default visibility `OWN_ONLY` for new orgs (already enforced at org-provisioning time in 6-1).
- Map Data Contract (Epic 10) will subscribe to `visibility_rule.changed` for cache invalidation.

### Dependencies

- E7.1 (configuration module exists)
- E3.3 (outbox relay)

### References

- PRD FR-6.6, §8.6, §14.2
- Arch §5.1, §5.4, §10.4 (tenancy posture)
- AuditEvent schema: [packages/domain-contracts/src/events/audit.ts#L179](packages/domain-contracts/src/events/audit.ts#L179) (`VisibilityRuleChangedSchema`)
- Schema: [schema.prisma#L99](apps/api/prisma/schema.prisma#L99) (`Organization.visibilityDefault`)

## Dev Agent Record

### Agent Model Used
Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References
- `pnpm --filter @fcm/api run build` → clean
- `pnpm test` → 420 pass / 3 skip / 0 fail (+12 over 7-5)

### File List
Added
- `apps/api/src/configuration/org-settings.service.ts`
- `apps/api/src/configuration/org-settings.controller.ts`
- `apps/api/test/org-settings-service.test.mjs`
- `apps/api/test/org-settings-controller-wiring.test.mjs`

Modified
- `apps/api/src/configuration/audit.ts` — added `emitVisibilityRuleChanged` helper
- `apps/api/src/configuration/configuration.module.ts` — register controller + service
