-- Story 6-2b: employee_blockers table for the active-blocker eligibility
-- check (Arch §6.2, PRD §7.5 condition 4, PRD §8.5).
--
-- The eligibility evaluator (Epic 9) reads:
--   EXISTS(SELECT 1 FROM employee_blockers
--           WHERE employee_id = $1 AND resolved_at IS NULL)
-- as THE canonical blocker check. The PARTIAL unique index on
-- (employee_id, kind) WHERE resolved_at IS NULL guarantees at most
-- one active blocker per (employee, kind) at any time — a second
-- PIP while the first is open is an admin-side bug.
--
-- Reason carries a 20-char minimum at the DB level so the audit trail
-- can never lose the why. opened_by + resolved_by reference `users`
-- (the authenticated actor) because the actor may or may not also be
-- an employee. FKs are NOT declared ON DELETE CASCADE for the actor
-- columns — a deleted user shouldn't silently strip attribution from
-- a historical blocker. Use SET NULL would lose the actor; use
-- RESTRICT blocks user deletion until blockers are reassigned. We
-- pick RESTRICT for the same defense-in-depth posture as
-- employees → tracks/levels.

CREATE TYPE "BlockerKind" AS ENUM ('PIP', 'PERFORMANCE_CONCERN', 'HR_HOLD', 'OTHER');

CREATE TABLE "employee_blockers" (
    "id"               UUID NOT NULL,
    "organization_id"  UUID NOT NULL,
    "employee_id"      UUID NOT NULL,
    "kind"             "BlockerKind" NOT NULL,
    "reason"           TEXT NOT NULL,
    "opened_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "resolved_at"      TIMESTAMPTZ,
    "opened_by"        UUID NOT NULL,
    "resolved_by"      UUID,
    "resolution_note"  TEXT,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "employee_blockers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_blockers_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "employee_blockers_employee_id_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "employee_blockers_opened_by_fkey"
        FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT,
    CONSTRAINT "employee_blockers_resolved_by_fkey"
        FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE RESTRICT,
    -- AC1: reason ≥20 chars. The threshold guarantees the audit
    -- trail can never lose the why behind a hold.
    CONSTRAINT "employee_blockers_reason_min_length"
        CHECK (char_length("reason") >= 20),
    -- A resolved row MUST have both resolved_at AND resolved_by set
    -- — otherwise the audit-read API can't attribute the resolution.
    -- An open row has both NULL. Mixed states are a programming bug.
    CONSTRAINT "employee_blockers_resolution_consistency"
        CHECK (
            ("resolved_at" IS NULL AND "resolved_by" IS NULL)
            OR
            ("resolved_at" IS NOT NULL AND "resolved_by" IS NOT NULL)
        )
);

-- AC1: PARTIAL unique on (employee_id, kind) WHERE resolved_at IS NULL.
-- Permits a re-open after a previous PIP is resolved.
CREATE UNIQUE INDEX "employee_blockers_active_unique"
    ON "employee_blockers"("employee_id", "kind")
    WHERE "resolved_at" IS NULL;

CREATE INDEX "employee_blockers_organization_id_idx"
    ON "employee_blockers"("organization_id");
CREATE INDEX "employee_blockers_employee_id_idx"
    ON "employee_blockers"("employee_id");
-- Hot path for the eligibility evaluator: "is this employee blocked?"
-- A partial index on the active rows makes EXISTS() cheap.
CREATE INDEX "employee_blockers_active_employee_idx"
    ON "employee_blockers"("employee_id")
    WHERE "resolved_at" IS NULL;

-- AC1 + AC3: RLS sweep.
ALTER TABLE "employee_blockers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_blockers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_employee_blockers" ON "employee_blockers"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
