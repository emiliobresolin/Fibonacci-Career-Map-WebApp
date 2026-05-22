-- Story 4-3: idempotency registry for recalc jobs (Arch §7.3 + FR-5.9).
--
-- Every score recalc is keyed on (employee_id, triggering_event_id).
-- The triggering_event_id is the outbox_events.event_id that produced
-- the recalc — evidence approval, role change, configuration change,
-- etc. Two retries of the same business event produce the same key,
-- so the second claim() short-circuits with AlreadyCompletedError
-- and the consumer skips the duplicate work.
--
-- The status enum is implemented as a TEXT column with a CHECK
-- constraint rather than a Postgres native enum so future variants
-- (e.g. 'cancelled', 'superseded') can be added without an ALTER TYPE.
--
-- Organization_id carries through for the RLS sweep — the orchestrator
-- consumer (Story 9-5) wraps its claim + insert in withOrgScope.

CREATE TABLE "recalc_jobs" (
    "id"                    UUID NOT NULL,
    "organization_id"       UUID NOT NULL,
    "employee_id"           UUID NOT NULL,
    "triggering_event_id"   UUID NOT NULL,
    "status"                TEXT NOT NULL DEFAULT 'pending',
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "completed_at"          TIMESTAMPTZ,
    "failure_reason"        TEXT,

    CONSTRAINT "recalc_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recalc_jobs_status_check"
        CHECK ("status" IN ('pending', 'completed', 'failed')),
    CONSTRAINT "recalc_jobs_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

-- Story 4-3 AC1: uniqueness on the pair. Two concurrent enqueues for
-- the same (employee, triggering event) collapse into one row at the
-- DB layer — even if the BullMQ jobId dedup misses (e.g. retry through
-- a partition window), this constraint catches the duplicate.
CREATE UNIQUE INDEX "recalc_jobs_employee_event_unique"
    ON "recalc_jobs"("employee_id", "triggering_event_id");

CREATE INDEX "recalc_jobs_organization_id_idx" ON "recalc_jobs"("organization_id");
CREATE INDEX "recalc_jobs_status_idx" ON "recalc_jobs"("status");
-- For the "list pending recalcs older than X" operator query (Story 4-5).
CREATE INDEX "recalc_jobs_pending_age_idx"
    ON "recalc_jobs"("created_at")
    WHERE "status" = 'pending';

-- RLS (Story 2-6 pattern). Closed-fail when app.current_org_id is unset.
ALTER TABLE "recalc_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recalc_jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_recalc_jobs" ON "recalc_jobs"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
