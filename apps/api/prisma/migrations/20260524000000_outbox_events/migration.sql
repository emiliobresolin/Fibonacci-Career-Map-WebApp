-- Story 3-2: outbox_events table + AFTER INSERT pg_notify trigger.
--
-- The transactional outbox is the heart of Arch §9.3 / AD-7. Every domain
-- mutation that must produce externally-observable effects (audit log,
-- realtime fanout, recalc enqueue) inserts a row here INSIDE the same DB
-- transaction as the business write. The relay worker (Story 3-3) is
-- woken via Postgres LISTEN/NOTIFY — no polling — and processes the row.
--
-- Atomicity guarantee: pg_notify queues the notification at COMMIT time.
-- If the business transaction rolls back, the outbox INSERT vanishes with
-- it AND the notification is never sent. This is what makes the outbox
-- pattern safe.
--
-- Relay safety net: Postgres does NOT buffer notifications for absent
-- listeners. If the relay disconnects (network blip, redeploy, pool
-- eviction), every NOTIFY fired during the gap is lost. The relay design
-- (Story 3-3) MUST therefore (a) catch up via `SELECT WHERE published_at
-- IS NULL` whenever LISTEN is re-established, and (b) run a periodic
-- safety scan independent of NOTIFY traffic. The relay must connect to
-- the primary — physical replicas do not receive NOTIFY.

CREATE TABLE IF NOT EXISTS "outbox_events" (
    "event_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "published_at" TIMESTAMPTZ,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("event_id")
);

-- Sanity guards on payload shape — relay consumers downstream expect an
-- object (`{...}`). JSONB `null` literal is technically valid JSONB but
-- meaningless as an event payload; reject it. octet_length cap keeps a
-- single fat payload from blowing the NOTIFY queue (8000-byte cap on
-- individual notifications; the queue itself is bounded ~8GB).
ALTER TABLE "outbox_events"
    ADD CONSTRAINT "outbox_events_payload_object_chk"
    CHECK (jsonb_typeof("payload") = 'object');
ALTER TABLE "outbox_events"
    ADD CONSTRAINT "outbox_events_payload_size_chk"
    CHECK (octet_length("payload"::text) <= 65536);

-- ─── Relay batch index (AC3) ────────────────────────────────────────────────
-- The relay scans `WHERE published_at IS NULL ORDER BY created_at ASC LIMIT
-- BATCH`. PG's default NULL ordering for ASC indexes is NULLS LAST, so we
-- declare NULLS FIRST explicitly.
CREATE INDEX IF NOT EXISTS "outbox_events_published_at_created_at_idx"
    ON "outbox_events" ("published_at" ASC NULLS FIRST, "created_at" ASC);

-- Partial index — much smaller for the hot relay path because the
-- unpublished set is small (transient) compared to the cumulative published
-- set. The composite above honors the AC's exact wording; this partial is
-- what the relay actually uses in practice.
CREATE INDEX IF NOT EXISTS "outbox_events_unpublished_idx"
    ON "outbox_events" ("created_at" ASC)
    WHERE "published_at" IS NULL;

-- ─── pg_notify trigger (AC2) ────────────────────────────────────────────────
-- AFTER INSERT FOR EACH ROW — statement-level would coalesce identical-payload
-- NOTIFYs within a single transaction (PG dedupes by (channel, payload)
-- pairs). Since each row has a unique event_id, row-level with a per-row
-- payload sidesteps coalescing.
--
-- The function pins `search_path = pg_catalog, public` so a user with CREATE
-- on a schema earlier in the connecting session's search_path cannot shadow
-- `pg_notify` with their own function. `pg_catalog.pg_notify` is fully
-- qualified for the same reason.
--
-- Atomicity reminder: pg_notify is queued and delivered at COMMIT time
-- only. ROLLBACK discards the queued notifications — exactly what AC4
-- asserts.
CREATE OR REPLACE FUNCTION "outbox_events_notify"()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    PERFORM pg_catalog.pg_notify('outbox_new', NEW.event_id::text);
    RETURN NULL; -- AFTER trigger return value is ignored
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "outbox_events_notify_trigger" ON "outbox_events";
CREATE TRIGGER "outbox_events_notify_trigger"
    AFTER INSERT ON "outbox_events"
    FOR EACH ROW
    EXECUTE FUNCTION "outbox_events_notify"();
-- ENABLE ALWAYS so the trigger fires even when a privileged session sets
-- `session_replication_role = replica` (which silently disables non-ALWAYS
-- triggers cluster-wide for the rest of the session). Without this, a
-- replication-mode replay could insert outbox rows that never wake the relay.
ALTER TABLE "outbox_events" ENABLE ALWAYS TRIGGER "outbox_events_notify_trigger";
