# Story 3.2: `outbox_events` table and post-commit LISTEN/NOTIFY trigger

Status: done

## Story

As a backend engineer,
I want an outbox table and a post-commit notification,
so that the relay worker can discover new events without polling.

## Acceptance Criteria

1. Migration creates `outbox_events` (event_id UUID PK, organization_id, aggregate_type, aggregate_id, event_type, payload JSONB, created_at, published_at nullable).
2. An AFTER INSERT trigger on `outbox_events` calls `pg_notify('outbox_new', event_id)`.
3. Index on `(published_at NULLS FIRST, created_at)` for the relay to batch unpublished rows.
4. A sample write in a transaction demonstrates the trigger fires on commit and not on rollback.

## Tasks / Subtasks

- [x] Task covering AC #1 — OutboxEvent Prisma model + migration creates outbox_events (event_id UUID PK, organization_id, aggregate_type, aggregate_id, event_type, payload JSONB, created_at, published_at nullable) + CHECK constraints (jsonb_typeof = 'object', octet_length ≤ 64KiB)
- [x] Task covering AC #2 — AFTER INSERT FOR EACH ROW trigger calls pg_catalog.pg_notify('outbox_new', NEW.event_id::text) via a SECURITY DEFINER function with `SET search_path = pg_catalog, public`; ENABLE ALWAYS so session_replication_role=replica cannot bypass
- [x] Task covering AC #3 — composite (published_at NULLS FIRST, created_at) index plus a partial `(created_at) WHERE published_at IS NULL` bonus index for the hot relay path
- [x] Task covering AC #4 — integration test demonstrates explicit BEGIN/COMMIT triggers a notification; explicit BEGIN/ROLLBACK does NOT, sentinel-anchored so a broken listener can't produce a vacuous pass

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E3.1

### References

- Arch §9.3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via bmad-dev-story.

### Debug Log References

- 139/139 scaffold tests passing
- `prisma validate` clean
- Three-layer adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) batched into a single fix pass.

### Completion Notes List

Initial implementation: OutboxEvent Prisma model, hand-written migration with AFTER INSERT trigger calling pg_notify, the AC3 composite index plus a partial-index bonus, scaffold structural test, live-PG integration test for AC4.

Review-batch patches (applied pre-commit):

- **`ENABLE ALWAYS` on the NOTIFY trigger.** Without it, any session calling `SET session_replication_role = replica` silently bypasses the trigger and outbox rows go unannounced — the relay would never wake for those events. Consistent with audit_events triggers.
- **`SECURITY DEFINER` + pinned `search_path = pg_catalog, public` on the trigger function.** Defends against a hostile schema earlier in the session search_path shadowing `pg_notify`. Also explicitly calls `pg_catalog.pg_notify(...)` so the fully-qualified resolution is locked in.
- **Integration test rewrite — explicit BEGIN/COMMIT and BEGIN/ROLLBACK.** Auditor flagged that the original COMMIT half relied on pg-client implicit autocommit, weakening the "fires on commit" demonstration. Both halves now bracket the INSERT in explicit transaction boundaries — symmetric to the AC4 wording.
- **Sentinel pattern in the ROLLBACK test.** Original test passed vacuously if the listener disconnected (received array stays empty, `!includes` is trivially true). Now after the rolled-back INSERT we commit a second known-good sentinel insert and wait for ITS notification — receiving the sentinel proves the channel is healthy and the rolled-back assertion is meaningful.
- **Event-driven `waitForNotification` with 5s timeout instead of 800ms wall-clock polling.** Old timer was a flake under CI load. Event-driven resolves immediately on the right notification and fails fast on a real regression.
- **Cleanup by `event_id`, not `event_type`.** Multiple concurrent dev/CI runs all inserting `event_type='test.commit'` would race the DELETE. Each test now mints its own UUID and cleans only that row.
- **`now()` instead of `CURRENT_TIMESTAMP` default.** Aligns with the Prisma `@default(now())` declaration to avoid spurious "drift" diffs from `prisma migrate dev`.
- **JSONB payload CHECK constraints.** `jsonb_typeof(payload) = 'object'` rejects JSON null / arrays / scalars (relay consumers expect objects); `octet_length(payload::text) <= 65536` keeps any single payload from blowing the NOTIFY queue (8000-byte cap per notification, ~8 GB cap on the queue itself).
- **`AC4` defense-in-depth test added.** Asserts that `pg_trigger.tgenabled = 'A'` (ENABLE ALWAYS) — a regression that flipped the trigger to default-ENABLE would now fail explicitly rather than only surfacing under exotic `replica` mode.
- **Scaffold test anchoring.** `findOutboxMigration` now matches `^\d{14}_outbox_events$` (full pattern, not a substring). `model OutboxEvent` regex is anchored to a real declaration line. Tightens against future substring drift.
- **Documented operational constraints in the migration preamble.** Relay must SELECT-on-reconnect to handle dropped NOTIFYs (PG doesn't buffer for absent listeners). Relay must connect to the primary (replicas don't propagate NOTIFY).

Acknowledged but deferred:
- No FK on `organization_id` (consistent with audit_events; outbox is short-lived enough that ON DELETE cascade vs orphan tolerance is a wash; documented as an explicit non-FK).
- `pg` client dependency lands with Story 3-3.
- The AC3 composite index is partly dominated by the partial; kept to honor the AC's literal wording while the partial is the one the relay's hot path actually uses. Future cleanup once 3-3 is up and we measure real query plans.

### File List

- `apps/api/prisma/schema.prisma` — adds OutboxEvent model with `@@index([publishedAt(sort: Asc), createdAt])`
- `apps/api/prisma/migrations/20260524000000_outbox_events/migration.sql` (new) — table, payload CHECK constraints, AC3 composite + partial indexes, hardened SECURITY DEFINER notify function with pinned search_path, AFTER INSERT trigger ENABLE ALWAYS
- `tests/scaffold/outbox-events-schema.test.mjs` (new) — 6 structural assertions across AC1–AC3 + integration-test-exists check, with anchored regexes
- `tests/integration/outbox-events-notify.test.mjs` (new) — AC4: explicit BEGIN/COMMIT and BEGIN/ROLLBACK halves + ENABLE-ALWAYS assertion; uses `t.skip()` (honest SKIPPED status) when DATABASE_URL or `pg` client is absent; sentinel-anchored ROLLBACK assertion
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 3-2 → done
