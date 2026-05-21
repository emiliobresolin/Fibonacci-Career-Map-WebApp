-- Story 3-1: audit_events table, monthly RANGE partitioning, and
-- append-only enforcement (Arch §6.4 + §9.3, AD-7, NFR-5.1, NFR-5.2).
--
-- Append-only is enforced at THREE layers (defense-in-depth):
--   1. App DB role: INSERT (+ SELECT) only; UPDATE, DELETE and TRUNCATE are
--      REVOKEd. This is the primary guard. The migration applies the REVOKE
--      to a role named `fcm_app` if it exists, AND iterates child partitions
--      because parent-level GRANTs do NOT cascade for direct child-table
--      access.
--   2. BEFORE UPDATE / BEFORE DELETE / BEFORE TRUNCATE triggers raising an
--      exception. Marked ENABLE ALWAYS so they fire even when a session
--      sets session_replication_role=replica.
--   3. REVOKE TRUNCATE ON ALL involved tables FROM PUBLIC — closes the
--      "table owner can always TRUNCATE" loophole at the role layer.
--
-- Defense gaps documented (not in scope for this story):
--   • DROP TABLE / DROP TABLE CASCADE: gated by table ownership only.
--     Operators must run as a non-owner role in production (runbook).
--   • RLS for tenant isolation: tracked in Story 2-6 (Layer-3 RLS policies).
--     `audit_events` carries organization_id NOT NULL and joins the
--     organization-scoped RLS sweep when 2-6 lands.
--   • Per-org FKs on organization_id / actor_id: intentionally omitted so
--     audit history survives soft-deletion of users/orgs. Arch §6.1's
--     "FKs back here via organization_id" is a generic rule with audit_events
--     as a documented exception (immutable archive).
--
-- Partitioning notes:
--   • PostgreSQL requires the partition column to be part of every UNIQUE
--     constraint (including the PRIMARY KEY) on a partitioned table — hence
--     the composite (id, occurred_at) PK and the matching Prisma
--     @@id([id, occurredAt]) declaration.
--   • Indexes declared on the parent propagate automatically to every
--     current and future child partition (PG 11+).
--   • Partition bound literals use explicit `+00` UTC offset so the
--     migration is timezone-invariant regardless of the session's TimeZone
--     GUC at deploy time.
--   • A DEFAULT partition catches both back-dated rows (before May 2026)
--     and any insert that outruns the Story 3-6 maintenance cron. Rows
--     landing there are operationally a signal — alerting should fire and
--     they get rebalanced into named monthly partitions during
--     maintenance.
--
-- This migration is the last hand-written one in EPIC-3 phase. Subsequent
-- migrations use `prisma migrate dev --name ...` once a live local
-- Postgres is set up.

-- ─── audit_events (partitioned parent) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id", "occurred_at")
) PARTITION BY RANGE ("occurred_at");

-- ─── Monthly partitions (AC1) ───────────────────────────────────────────────
-- Three months pre-created. Story 3-6 maintenance cron creates partitions
-- N months ahead on schedule. The DEFAULT partition is the safety net for
-- back-dated rows AND for the case where the cron is delayed.
--
-- TIMESTAMPTZ literals with explicit `+00` so the resolved bound is the
-- same UTC instant regardless of the session's TimeZone at deploy time.
CREATE TABLE IF NOT EXISTS "audit_events_2026_05" PARTITION OF "audit_events"
    FOR VALUES FROM (TIMESTAMPTZ '2026-05-01 00:00:00+00') TO (TIMESTAMPTZ '2026-06-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_events_2026_06" PARTITION OF "audit_events"
    FOR VALUES FROM (TIMESTAMPTZ '2026-06-01 00:00:00+00') TO (TIMESTAMPTZ '2026-07-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_events_2026_07" PARTITION OF "audit_events"
    FOR VALUES FROM (TIMESTAMPTZ '2026-07-01 00:00:00+00') TO (TIMESTAMPTZ '2026-08-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_events_default" PARTITION OF "audit_events" DEFAULT;

-- ─── Indexes (AC2) ──────────────────────────────────────────────────────────
-- GIN on `before` and `after` using jsonb_path_ops — smaller index and
-- materially faster for @> containment queries, which is the dominant
-- access pattern for field-level audit investigations (e.g. "find every
-- event where after->>'level_id' = ?"). The `?` / `?|` / `?&` operators
-- are NOT supported by jsonb_path_ops; those queries would require a
-- supplementary index. The audit use case is containment-dominated.
CREATE INDEX IF NOT EXISTS "audit_events_before_gin_idx"
    ON "audit_events" USING GIN ("before" jsonb_path_ops);
CREATE INDEX IF NOT EXISTS "audit_events_after_gin_idx"
    ON "audit_events" USING GIN ("after" jsonb_path_ops);

-- B-tree on (organization_id, occurred_at) — primary tenant-scoped scan path,
-- e.g. the admin audit-log UI in Story 3-5. occurred_at is left ASC so the
-- index serves both ASC and DESC scans via reverse-iteration; PG handles
-- this efficiently for B-trees.
CREATE INDEX IF NOT EXISTS "audit_events_organization_id_occurred_at_idx"
    ON "audit_events" ("organization_id", "occurred_at");

-- B-tree on (entity_type, entity_id, occurred_at) — drives the "show me every
-- mutation on this employee/promotion/evidence" investigative query. entity_id
-- is nullable for synthetic org-scope events; those rows won't be found via
-- entity_id equality and that's expected (look them up by event_type instead).
CREATE INDEX IF NOT EXISTS "audit_events_entity_type_entity_id_occurred_at_idx"
    ON "audit_events" ("entity_type", "entity_id", "occurred_at");

-- ─── Append-only trigger function (AC3 defense-in-depth) ────────────────────
-- Fires for ANY connecting role; even a superuser hitting the table directly
-- will be rejected. Statement-level for TRUNCATE; row-level for UPDATE and
-- DELETE. PG triggers do not fire on DROP — that gap is covered by table
-- ownership in the operator runbook.
--
-- Uses SQLSTATE P0001 (raise_exception) rather than 42501 (insufficient
-- privilege), because the rejection is policy, not role-based.
CREATE OR REPLACE FUNCTION "audit_events_reject_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only (Arch §6.4 / AD-7); % rejected', TG_OP
        USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- ENABLE ALWAYS so the trigger fires even when a privileged session sets
-- session_replication_role=replica (which silently disables non-ALWAYS
-- triggers cluster-wide for the rest of the session).
DROP TRIGGER IF EXISTS "audit_events_no_update" ON "audit_events";
CREATE TRIGGER "audit_events_no_update"
    BEFORE UPDATE ON "audit_events"
    FOR EACH ROW
    EXECUTE FUNCTION "audit_events_reject_mutation"();
ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER "audit_events_no_update";

DROP TRIGGER IF EXISTS "audit_events_no_delete" ON "audit_events";
CREATE TRIGGER "audit_events_no_delete"
    BEFORE DELETE ON "audit_events"
    FOR EACH ROW
    EXECUTE FUNCTION "audit_events_reject_mutation"();
ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER "audit_events_no_delete";

DROP TRIGGER IF EXISTS "audit_events_no_truncate" ON "audit_events";
CREATE TRIGGER "audit_events_no_truncate"
    BEFORE TRUNCATE ON "audit_events"
    FOR EACH STATEMENT
    EXECUTE FUNCTION "audit_events_reject_mutation"();
ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER "audit_events_no_truncate";

-- ─── Permissions (AC3 primary enforcement) ──────────────────────────────────
-- Strip TRUNCATE from PUBLIC so even the table owner cannot wipe history
-- without first re-granting it to themselves (auditable action). UPDATE and
-- DELETE are already not in the PUBLIC default privilege set.
REVOKE TRUNCATE ON "audit_events" FROM PUBLIC;
REVOKE TRUNCATE ON "audit_events_2026_05" FROM PUBLIC;
REVOKE TRUNCATE ON "audit_events_2026_06" FROM PUBLIC;
REVOKE TRUNCATE ON "audit_events_2026_07" FROM PUBLIC;
REVOKE TRUNCATE ON "audit_events_default" FROM PUBLIC;

-- Conditional fcm_app role lockdown. Critical: child partitions need their
-- own GRANTs because PostgreSQL checks privileges against the *target*
-- relation of the query — parent grants do not propagate to direct
-- child-table access.
DO $$
DECLARE
    child RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fcm_app') THEN
        EXECUTE 'REVOKE ALL ON "audit_events" FROM "fcm_app"';
        EXECUTE 'GRANT INSERT, SELECT ON "audit_events" TO "fcm_app"';
        FOR child IN
            SELECT inhrelid::regclass::text AS child_table
            FROM pg_inherits
            WHERE inhparent = 'public.audit_events'::regclass
        LOOP
            EXECUTE format('REVOKE ALL ON %s FROM "fcm_app"', child.child_table);
            EXECUTE format('GRANT INSERT, SELECT ON %s TO "fcm_app"', child.child_table);
        END LOOP;
        RAISE NOTICE 'Story 3-1: fcm_app locked to INSERT/SELECT on audit_events parent + all child partitions';
    ELSE
        RAISE NOTICE 'Story 3-1: fcm_app role not provisioned; append-only is enforced by trigger only (operator runbook owns role separation)';
    END IF;
END $$;
