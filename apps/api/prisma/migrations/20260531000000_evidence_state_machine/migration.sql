-- Story 8-1: Evidence entity + state machine (Arch §6.2, PRD FR-4.4).
--
-- The evidence table is the source of truth for every artifact an
-- employee submits against a requirement. Each row carries its own
-- lifecycle state (DRAFT → PENDING_APPROVAL → APPROVED / REJECTED /
-- EXPIRED). Transitions are gated by the EvidenceStateMachine in
-- apps/api/src/evidence/evidence-state-machine.ts; this migration is
-- the storage layer those transitions write through.
--
-- Tenant scope: every row carries organization_id NOT NULL and gets
-- the Story 2-6 RLS sweep (ENABLE + FORCE + tenant_isolation_evidence
-- policy with the closed-fail `current_setting(..., true)` predicate).
-- Cross-tenant reads/writes are impossible at the DB layer regardless
-- of caller intent.
--
-- Payload split: per PRD §8.4, a requirement's evidence_type drives
-- which surface the employee gets — FILE submissions land bytes in S3
-- and the row carries `storage_object_key`; TEXT / URL / STRUCTURED
-- submissions store their content directly in `payload` JSONB. The
-- two columns are nullable independently because:
--   • a DRAFT row may have neither yet (employee hasn't finalized);
--   • a FILE-type submission has storage_object_key but no payload;
--   • a TEXT/URL/STRUCTURED submission has payload but no key.
-- The "exactly one of payload OR storage_object_key is set on a
-- submitted row" rule is enforced in the finalize flow (Story 8-2),
-- NOT here — the DB-level CHECK would block DRAFT creation that lacks
-- both, which is legitimate.
--
-- Approval/expiry timestamps:
--   • `submitted_at` is set when DRAFT → PENDING_APPROVAL fires
--     (finalize). Nullable because a DRAFT row exists before then.
--   • `approved_at` is set when PENDING_APPROVAL → APPROVED fires.
--   • `expires_at` is computed by the approval handler from
--     `approved_at + requirement.expiry_months`; null when the
--     requirement has no expiry.
-- A CHECK constraint enforces approved_at IS NOT NULL once state =
-- APPROVED (defense against a buggy service that flips state without
-- stamping the timestamp). EXPIRED keeps approved_at intact (the row
-- WAS approved at some point); transition just sets the state.
--
-- Cascade posture:
--   • organization FK CASCADE: tenant delete wipes evidence (matches
--     the existing pattern for all tenant-scoped tables).
--   • employee FK CASCADE: deleting an employee row removes their
--     evidence. Evidence is per-employee — orphaned rows would have
--     no scoring meaning. Note: production employees use soft-
--     deactivation (deactivated_at), not hard delete; CASCADE is for
--     the rare full-purge path.
--   • requirement FK RESTRICT: a requirement delete is blocked while
--     evidence rows reference it. Operators must deactivate the
--     requirement (active=false) which keeps audit-trail integrity;
--     hard delete only succeeds after a manual cleanup pass. Same
--     defense-in-depth posture as employees → tracks/levels.

CREATE TYPE "EvidenceState" AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'EXPIRED'
);

CREATE TABLE "evidence" (
    "id"                  UUID NOT NULL,
    "organization_id"     UUID NOT NULL,
    "employee_id"         UUID NOT NULL,
    "requirement_id"      UUID NOT NULL,
    "state"               "EvidenceState" NOT NULL DEFAULT 'DRAFT',
    "payload"             JSONB,
    "storage_object_key"  TEXT,
    "submitted_at"        TIMESTAMPTZ,
    "approved_at"         TIMESTAMPTZ,
    "expires_at"          TIMESTAMPTZ,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "evidence_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "evidence_employee_id_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "evidence_requirement_id_fkey"
        FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE RESTRICT,
    -- An APPROVED / REJECTED / EXPIRED row MUST have been submitted —
    -- a row that skipped the submitted_at stamp would be invisible to
    -- the manager-review surface (PRD §6.3) which keys off
    -- (state=PENDING_APPROVAL AND submitted_at IS NOT NULL).
    CONSTRAINT "evidence_submitted_at_for_post_draft" CHECK (
        "state" = 'DRAFT' OR "submitted_at" IS NOT NULL
    ),
    -- approved_at MUST be set for APPROVED rows AND remain set for
    -- EXPIRED (which is reachable only from APPROVED via the expiry
    -- cron, FR-4.8). REJECTED is the wrinkle: it's reachable both
    -- from PENDING_APPROVAL (never approved → approved_at IS NULL)
    -- AND from APPROVED retroactively (FR-4.7 → approved_at IS NOT
    -- NULL preserved), so the constraint leaves it unconstrained.
    -- The audit-read surface relies on approved_at to render
    -- "approved on …" even after retroactive rejection or expiry;
    -- a buggy service that flipped state without stamping the
    -- timestamp WOULD pass an `IN (APPROVED, REJECTED, EXPIRED)`
    -- predicate, so we pin APPROVED and EXPIRED explicitly.
    CONSTRAINT "evidence_approved_at_consistency" CHECK (
        ("state" IN ('DRAFT', 'PENDING_APPROVAL') AND "approved_at" IS NULL)
        OR
        ("state" IN ('APPROVED', 'EXPIRED') AND "approved_at" IS NOT NULL)
        OR
        "state" = 'REJECTED'
    )
);

-- Hot-path indexes:
--   • (organization_id) for the RLS predicate's GUC join + tenant-wide reads
--   • (employee_id, state) for the employee panel ("show me my pending
--     submissions") and the scoring loader ("approved evidence for
--     employee X at current level"). Story 9-1's calculateScore walks
--     this index.
--   • (requirement_id) for the change-impact preview (Story 7-8 +
--     7-9): when a requirement's weight/active flips, the bulk-recalc
--     consumer needs to enumerate affected employees by joining
--     evidence on requirement_id.
--   • (organization_id, state, expires_at) for the expiry-scan cron
--     (Story 8-7): the daily scan filters
--     `state = APPROVED AND expires_at < NOW()` and the partial index
--     scopes the scan to that exact predicate so the planner doesn't
--     read the whole table.
CREATE INDEX "evidence_organization_id_idx" ON "evidence"("organization_id");
CREATE INDEX "evidence_employee_state_idx" ON "evidence"("employee_id", "state");
CREATE INDEX "evidence_requirement_id_idx" ON "evidence"("requirement_id");
CREATE INDEX "evidence_expiry_scan_idx"
    ON "evidence"("organization_id", "expires_at")
    WHERE "state" = 'APPROVED' AND "expires_at" IS NOT NULL;

ALTER TABLE "evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_evidence" ON "evidence"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
