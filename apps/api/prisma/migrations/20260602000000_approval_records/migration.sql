-- Story 8-4: approval_records table (Arch §6.2, PRD FR-4.5 / FR-4.6 / §6.3).
--
-- One row per approve/reject decision against either an evidence row
-- (Stories 8-4 / 8-5 / 8-6) OR a promotion record (Epic 13). The
-- table is a SHARED decision log — same shape, same audit posture, two
-- parents. The CHECK constraint enforces "exactly one parent" so a
-- decision can't be ambiguously attached to both.
--
-- promotion_records doesn't ship until Epic 13, so promotion_record_id
-- is declared as a NULLABLE UUID with NO FK constraint here. A
-- follow-up migration in 13-X will add the FK once the parent table
-- exists. The CHECK constraint above already enforces it's exclusive
-- with evidence_id at the row level, so the missing FK is purely a
-- referential-integrity gap (we trust the producer service for now).
--
-- Append-only posture:
--   • DB role `fcm_app` is locked to INSERT/SELECT (no UPDATE/DELETE).
--   • Defense-in-depth BEFORE UPDATE/DELETE/TRUNCATE trigger rejects
--     every mutation regardless of role (same pattern as audit_events,
--     ENABLE ALWAYS so session_replication_role=replica can't bypass).
--
-- Why approve/reject with mandatory reasons live on the row, not the
-- evidence row itself: PRD §6.3 + §10.1 — "every approve/reject
-- decision is logged immutably with actor, timestamp, reason, evidence
-- reference, and before/after score state". Putting the reason on the
-- evidence row would make a retroactive rejection (Story 8-6) lose
-- the original approval's reason; the approval_records log preserves
-- every decision's context permanently.

CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

CREATE TABLE "approval_records" (
    "id"                     UUID NOT NULL,
    "organization_id"        UUID NOT NULL,
    "evidence_id"            UUID,
    "promotion_record_id"    UUID,
    "actor_id"               UUID NOT NULL,
    "decision"               "ApprovalDecision" NOT NULL,
    "reason"                 TEXT NOT NULL,
    "decided_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "approval_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_records_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "approval_records_evidence_id_fkey"
        FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE,
    -- promotion_record_id intentionally has NO FK constraint — the
    -- parent table promotion_records lands in Epic 13. A follow-up
    -- migration in 13-X adds the FK. The CHECK below already enforces
    -- exclusivity with evidence_id at insertion time.
    CONSTRAINT "approval_records_actor_id_fkey"
        FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT,
    -- AC1: each row references exactly one parent — XOR (evidence OR
    -- promotion, not both, not neither). The two-arm CHECK below is
    -- the canonical PostgreSQL XOR shape for nullable FKs (a single
    -- `(a IS NOT NULL) <> (b IS NOT NULL)` is the bool-XOR equivalent).
    CONSTRAINT "approval_records_exactly_one_parent" CHECK (
        ("evidence_id" IS NOT NULL AND "promotion_record_id" IS NULL)
        OR
        ("evidence_id" IS NULL AND "promotion_record_id" IS NOT NULL)
    ),
    -- Reason floor enforced per decision, after btrim() so a
    -- whitespace-only payload cannot satisfy the length floor by
    -- padding (e.g. ten spaces would pass `char_length(reason) >= 10`
    -- but is semantically empty). The service layer already trims +
    -- validates with the same floors — this CHECK is the
    -- defense-in-depth that fires when a bypass-the-service caller
    -- (bulk import, future admin tool, ad-hoc psql) violates the
    -- contract.
    --   APPROVED → ≥10 non-whitespace chars (matches story AC2)
    --   REJECTED → ≥20 non-whitespace chars (matches story AC2)
    CONSTRAINT "approval_records_reason_min_length" CHECK (
        ("decision" = 'APPROVED' AND char_length(btrim("reason")) >= 10)
        OR
        ("decision" = 'REJECTED' AND char_length(btrim("reason")) >= 20)
    )
);

-- Hot-path indexes:
--   • (organization_id) for the RLS predicate + tenant-wide audit reads
--   • (evidence_id, decided_at DESC) for "show every decision on this
--     evidence row" (the audit-trail surface for Story 15-3 / 15-4).
--   • (actor_id, decided_at DESC) for "manager approval pattern report"
--     (Story 15-7 — averages per actor over time windows).
--   • (organization_id, decided_at DESC) for the report at
--     Story 14-5 (manager review latency leaderboard).
CREATE INDEX "approval_records_organization_id_idx"
    ON "approval_records"("organization_id");
CREATE INDEX "approval_records_evidence_decided_idx"
    ON "approval_records"("evidence_id", "decided_at" DESC)
    WHERE "evidence_id" IS NOT NULL;
CREATE INDEX "approval_records_promotion_decided_idx"
    ON "approval_records"("promotion_record_id", "decided_at" DESC)
    WHERE "promotion_record_id" IS NOT NULL;
CREATE INDEX "approval_records_actor_decided_idx"
    ON "approval_records"("actor_id", "decided_at" DESC);
CREATE INDEX "approval_records_org_decided_idx"
    ON "approval_records"("organization_id", "decided_at" DESC);

-- ─── RLS sweep (Story 2-6 standard) ────────────────────────────────
ALTER TABLE "approval_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_approval_records" ON "approval_records"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

-- ─── Append-only trigger function (AC1 defense-in-depth) ───────────
-- Fires for any connecting role; even a superuser hitting the table
-- directly will be rejected. Mirrors the audit_events pattern (Story
-- 3-1). ENABLE ALWAYS so session_replication_role=replica can't bypass.
CREATE OR REPLACE FUNCTION "approval_records_reject_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'approval_records is append-only (Arch §6.2 / Story 8-4); % rejected', TG_OP
        USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "approval_records_no_update" ON "approval_records";
CREATE TRIGGER "approval_records_no_update"
    BEFORE UPDATE ON "approval_records"
    FOR EACH ROW
    EXECUTE FUNCTION "approval_records_reject_mutation"();
ALTER TABLE "approval_records" ENABLE ALWAYS TRIGGER "approval_records_no_update";

DROP TRIGGER IF EXISTS "approval_records_no_delete" ON "approval_records";
CREATE TRIGGER "approval_records_no_delete"
    BEFORE DELETE ON "approval_records"
    FOR EACH ROW
    EXECUTE FUNCTION "approval_records_reject_mutation"();
ALTER TABLE "approval_records" ENABLE ALWAYS TRIGGER "approval_records_no_delete";

DROP TRIGGER IF EXISTS "approval_records_no_truncate" ON "approval_records";
CREATE TRIGGER "approval_records_no_truncate"
    BEFORE TRUNCATE ON "approval_records"
    FOR EACH STATEMENT
    EXECUTE FUNCTION "approval_records_reject_mutation"();
ALTER TABLE "approval_records" ENABLE ALWAYS TRIGGER "approval_records_no_truncate";

-- ─── Permissions (AC1 primary enforcement via DB role) ─────────────
REVOKE TRUNCATE ON "approval_records" FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fcm_app') THEN
        EXECUTE 'REVOKE ALL ON "approval_records" FROM "fcm_app"';
        EXECUTE 'GRANT INSERT, SELECT ON "approval_records" TO "fcm_app"';
        RAISE NOTICE 'Story 8-4: fcm_app locked to INSERT/SELECT on approval_records';
    ELSE
        RAISE NOTICE 'Story 8-4: fcm_app role not provisioned; append-only is enforced by trigger only';
    END IF;
END $$;
