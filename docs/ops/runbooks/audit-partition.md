# Runbook: audit_events partition maintenance

**Owner:** platform on-call
**Related metric:** `fcm_audit_partition_lookahead_months`
**Related alert (EPIC-16):** `lookahead < 1 for > 1h`

## What this job does

The worker process runs a weekly BullMQ cron (`snapshot.partition-maintenance`,
`0 0 * * 0` UTC) that ensures the next 3 months of `audit_events` monthly
partitions exist. Story 3-1 established the partitioning scheme; Story 3-6
keeps it running.

Pure helpers (`nextMonths`, `nextMonthYM`) compute the target partition
names from an anchor date; the consumer issues
`CREATE TABLE IF NOT EXISTS audit_events_YYYY_MM PARTITION OF audit_events ...`
+ `REVOKE TRUNCATE ON ... FROM PUBLIC` for each. Repeated runs are no-ops.

## Signal: `fcm_audit_partition_lookahead_months`

Sampled every 5 minutes by `PartitionLookaheadService` (worker only). The
gauge value is the longest consecutive run of months starting from `now()`
that have a named `audit_events_YYYY_MM` partition. A gap mid-window caps
the gauge below the run length.

| Value | Meaning |
|---|---|
| 0 | Current month has no partition — IMMEDIATE incident. Audit writes are landing in `audit_events_default` (or failing if it was removed). |
| 1 | Only the current month is covered. The next cron run must succeed within the month. |
| 2 | One month of slack remaining. |
| 3 (steady-state) | Healthy. Cron is keeping pace. |
| 4–6 | Cron is running ahead. Benign. |

## When the alert fires

If `fcm_audit_partition_lookahead_months < 1` for over an hour, page the
on-call. Likely causes:

1. **Worker process down** — check `fcm_worker_heartbeat` and pod logs.
   The cron job needs the worker fleet to be up at the scheduled tick.
2. **BullMQ Redis unreachable** — check the worker's BullMQ connection.
3. **DDL permission missing** — the connecting DB role can't `CREATE TABLE`.
   Check `pg_roles` and grant `CREATE` on the schema.
4. **Schema drift** — a manually-created partition mapped to a different
   range raises `42P17` and DLQs the job. Look at `audit.outbox-relay.dlq`
   (this job uses `snapshot.partition-maintenance.dlq`); inspect the
   failure reason.

## Manual sweep

If the cron is broken and you need to run it now:

```bash
# Anchor optional; defaults to NOW(). Useful for tests:
pnpm --filter @fcm/api run-script <tbd-cli-command-when-it-lands>
```

(The dedicated admin CLI is part of Story 4-5 internal DLQ admin tool.
Until that ships, drive the queue directly via a one-shot script that
posts a `partition-maintenance` job to the BullMQ queue.)

## Verifying after a run

```sql
SELECT inhrelid::regclass::text AS partition_name
  FROM pg_inherits
 WHERE inhparent = 'public.audit_events'::regclass
 ORDER BY partition_name;
```

Expected: at least one partition per month from the current month forward,
plus the `audit_events_default` catch-all.

## Related stories

- Story 3-1 — partitioned `audit_events` table baseline.
- Story 3-3 — outbox relay that writes into this table (depth gauge is
  the read-side counterpart of the lookahead gauge).
- Story 3-6 — this maintenance job.
- Story 4-5 — DLQ admin tooling (when it lands, point this runbook at
  the inspector command).
