# Story 7.7: Approval Workflow CRUD with per-level overrides

Status: done (org-level surface only — see F7-7a below)

## Story

As an **ADMIN**, I want to **read and update my organization's default approval workflow** (one of `SINGLE` / `DUAL_MANAGER` / `HR_GATE`), so that **the Epic-13 promotion-workflow engine knows which approval chain to enforce when a manager initiates a promotion**.

## Acceptance Criteria

1. **(SHIPPED)** `GET /v1/organizations/me/approval-workflow` and `PATCH /v1/organizations/me/approval-workflow` (both ADMIN-only). Validates against `Prisma.ApprovalWorkflow` enum at runtime (drift-safe).
2. Supported values: `SINGLE`, `DUAL_MANAGER`, `HR_GATE`.
3. Mutation emits one `approval_workflow.changed` outbox event with `before.fromKind` + `after.toKind`. Same dedicated-event-type rationale as 7-6 (Epic 13 subscribes narrowly).

### Scope deferred — F7-7a

The original spec also listed `GET/PATCH /v1/levels/:id/approval-workflow` (nullable; null falls back to org default). **Not shipped in this story** — the Prisma schema has no override column on `levels` or `promotion_rules`, and adding one requires a migration that's out of scope. Tracking as **F7-7a**:

- Add `approval_workflow_override` (`ApprovalWorkflow` enum, nullable) to either `levels` or `promotion_rules` via a new migration.
- Extend `OrgSettingsService` (or factor a `LevelApprovalOverrideService`) with `getLevelOverride` / `updateLevelOverride`.
- Add a `LevelApprovalWorkflowController` for the `/v1/levels/:id/approval-workflow` half.
- A wiring test in 7-7 already pins the absence of `getLevelOverride` / `updateLevelOverride` on `ApprovalWorkflowController` so a future maintainer can't add the surface without explicitly choosing where it lives.

The PromotionRule `managerRequired` / `hrRequired` booleans (Story 7-5) carry the substantive override semantics for `SINGLE` vs `HR_GATE` per-level today; `DUAL_MANAGER` per-level is what F7-7a adds.

## Tasks / Subtasks

- [x] Extended `OrgSettingsService` with `getApprovalWorkflow` + `updateApprovalWorkflow` (mirrors visibility shape from 7-6).
- [x] Added `ApprovalWorkflowController` at `/v1/organizations/me/approval-workflow`.
- [x] Added `emitApprovalWorkflowChanged` helper in `audit.ts` matching `ApprovalWorkflowChangedSchema`.
- [x] Race-safe: `SELECT id FROM organizations WHERE id = $1 FOR UPDATE` before the read.
- [x] RLS defense-in-depth: GET wrapped in `withOrgScope`; bare-prisma-bypass pinned by test.
- [x] Idempotent no-op: PATCH to same value is a true no-op.
- [x] Drift detector against `Prisma.ApprovalWorkflow`.
- [x] Wiring test pins per-level handler absence (F7-7a guard).
- [x] Build clean; 433 pass / 3 skip / 0 fail (+13 over 7-6's 420).

## Dev Notes

### Adversarial Review Outcomes

Reviewer (general-purpose, fresh context) found 1 BLOCKER / 2 MAJOR / 3 MINOR. Fixed:

- **BLOCKER B1**: story spec out of date / not honest about deferred scope. **FIXED** — this file now honestly marks the per-level half as F7-7a, with a clear migration recipe.
- **MAJOR M1**: orphaned `emitVisibilityRuleChanged` JSDoc after I inserted approval-workflow above it. **FIXED** — reordered so docstrings sit above the functions they document.
- **MAJOR M2**: drift safeguard for bare-prisma reads dropped from approval-workflow test. **FIXED** — added `baseFindUnique` tracking + assertion mirroring 7-6's fake.

Not changed (deliberate):
- **MINOR m1** (import alphabetization): cosmetic.
- **MINOR m2** (audit field names): confirmed correct (`fromKind` / `toKind`).
- **MINOR m3** (per-level deferral in code): controller surface test pins absence.

### Architecture Compliance

Same as 7-6 — §5.1 module ownership, §5.4 tx co-commit, dedicated-event-type for narrow Epic-13 subscription.

### Dependencies

- E7.1 (configuration module exists)
- E2.6 (RLS)
- E3.3 (outbox relay)

### References

- PRD FR-6.7, §8.7
- Arch §5.1, §5.4
- AuditEvent schema: [packages/domain-contracts/src/events/audit.ts#L191](packages/domain-contracts/src/events/audit.ts#L191) (`ApprovalWorkflowChangedSchema`)
- Schema: [schema.prisma#L100](apps/api/prisma/schema.prisma#L100) (`Organization.approvalWorkflowDefault`)

## Dev Agent Record

### Agent Model Used
Opus 4.7 (1M context) — autonomous-team-mode

### Debug Log References
- `pnpm --filter @fcm/api run build` → clean
- `pnpm test` → 433 pass / 3 skip / 0 fail (+13 over 7-6)

### Deferred to follow-up
- **F7-7a** — per-level approval-workflow override (`GET/PATCH /v1/levels/:id/approval-workflow`). Requires schema migration adding `approval_workflow_override` column.

### File List
Added
- `apps/api/src/configuration/approval-workflow.controller.ts`
- `apps/api/test/approval-workflow-service.test.mjs`
- `apps/api/test/approval-workflow-controller-wiring.test.mjs`

Modified
- `apps/api/src/configuration/org-settings.service.ts` — added approval-workflow getter/updater + validator
- `apps/api/src/configuration/audit.ts` — added `emitApprovalWorkflowChanged` helper
- `apps/api/src/configuration/configuration.module.ts` — register `ApprovalWorkflowController`
