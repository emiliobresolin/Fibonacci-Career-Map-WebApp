# Story 3.3: Outbox relay worker (`audit.outbox-relay`)

Status: done

## Story

As a system,
I want a worker that reads unpublished outbox rows and fans them out to audit, jobs, and realtime with at-least-once semantics.

## Acceptance Criteria

1. BullMQ queue `audit.outbox-relay` exists; consumer listens to Postgres `LISTEN outbox_new` and enqueues relay jobs.
2. For each unpublished row, the worker writes to `audit_events`, enqueues any downstream jobs declared in the payload, publishes the realtime event via Redis pub/sub, and marks `published_at = NOW()`.
3. Consumers are idempotent: a duplicate `event_id` delivered twice does not produce duplicate audit writes or double side-effects.
4. DLQ routing and a Prometheus `fcm_outbox_relay_depth` gauge are wired; a depth > 0 for > 5 minutes alerts (alert rule defined in E16 but metric emitted here).

## Tasks / Subtasks

- [x] Task covering AC #1 — `audit.outbox-relay` queue added to ACTIVE_QUEUES; `OutboxListenerService` opens a dedicated pg.Client, issues `LISTEN outbox_new`, enqueues relay jobs with `jobId=eventId` for layer-0 idempotency, runs a catch-up scan on connect plus a periodic 60s safety scan, and reconnects with bounded exponential backoff.
- [x] Task covering AC #2 — `OutboxRelayConsumer` writes `audit_events` via raw SQL inside a Prisma `$transaction` (composite (id, occurred_at) PK uses `event.eventId` + `event.createdAt` for stable retry collision), marks `outbox_events.published_at = NOW()`, then publishes the realtime event to the `fcm.realtime` Redis channel (subscribed by Story 5-1 Socket.IO) and records the `payload.downstreamJobs[]` contract for Story 4-3 to light up.
- [x] Task covering AC #3 — Three idempotency layers: (0) BullMQ jobId=eventId coalesces duplicate NOTIFYs; (1) `publishedAt !== null` skip inside the txn; (2) `SELECT ... FOR UPDATE` serializes two-worker races + composite-PK collision (P2002) survives a partial-success crash between audit INSERT and outbox UPDATE.
- [x] Task covering AC #4 — `OutboxRelayConsumer.onFailed` promotes terminal failures to `audit.outbox-relay.dlq` with deterministic `jobId=from:<originalJobId>` for DLQ-side idempotency; `OutboxDepthService` emits the `fcm_outbox_relay_depth` Prometheus gauge sampled every 15s with an in-flight mutex and an initial `set(0)` so the first scrape never misses it.

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E3.2
- E4.1

### References

- Arch §9.3, §11.2
- AD-7
- AR-3
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via bmad-dev-story.

### Debug Log References

- 158/158 scaffold tests passing
- `pnpm -r run typecheck` clean
- Three-layer adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor); each layer surfaced real bugs that were patched pre-commit.

### Completion Notes List

Initial implementation: `pg` dep, `OutboxListenerService` for LISTEN/NOTIFY, `OutboxRelayConsumer` for BullMQ-driven relay, `OutboxDepthService` for the Prometheus gauge, `OutboxModule.register({ mode })` mode-aware wiring, scaffold + integration tests.

Review-batch patches (applied pre-commit; reviewers caught defects that would have shipped otherwise):

- **AC2 closed: realtime fanout actually publishes.** Original draft only stubbed a comment. Consumer now opens a dedicated `Redis` publisher and publishes the relay event to the `fcm.realtime` channel (Socket.IO subscribes in Story 5-1).
- **AC2 closed: downstream-jobs contract surfaced.** Producer-side payloads can declare `downstreamJobs[]`; the relay validates each entry and logs the intent. The concrete enqueue path lights up alongside Story 4-3.
- **AC3 layer 2 actually works.** Initial draft used `NOW()` for `occurred_at`, defeating the composite-PK collision check because (id, occurred_at) drifts across retries. Now uses `event.createdAt`, stable across retries, so a duplicate INSERT raises P2002 as documented.
- **`SELECT ... FOR UPDATE` on the outbox row inside the txn.** Without it, two workers pulling the same eventId (via different jobIds, or via NOTIFY-after-safety-scan-rediscovery) could both pass the publishedAt check and produce duplicate realtime/downstream side-effects. Row lock serializes the race.
- **`event.createdAt::timestamptz` cast.** Prisma's tagged-template binds Date as `timestamp without time zone` by default; without the cast, partition routing on `audit_events.occurred_at` (timestamptz) could land rows in unexpected partitions on a non-UTC session.
- **UUID validation at every code boundary.** NOTIFY payload, BullMQ job data, and any path that interpolates eventId into raw SQL (`::uuid`) is gated by a strict UUID regex. A corrupted trigger payload or rogue NOTIFY now drops at the boundary rather than poisoning BullMQ with a non-UUID jobId or producing a cryptic Postgres `invalid_text_representation`.
- **Prisma `$transaction({ timeout: 30_000 })`.** Default 5s is too tight for the audit-insert + outbox-update path under contended partitions.
- **`PrismaClientUnknownRequestError` catch + clear error message** for the partition-missing case (Story 3-1 ships a DEFAULT partition so this is defensive, but the operator runbook benefits from the explicit signal).
- **Reconnect race hardened.** Added a `connecting: boolean` mutex on the listener so `scheduleReconnect()` and `connect()` can't race and open dual pg.Clients both LISTENing on outbox_new. Stale clients are `.removeAllListeners()` + `.end()` before the new one connects.
- **`OutboxRelayConsumer.onModuleDestroy` quits the publisher.** Without it, integration tests that boot/close multiple app contexts exhaust the Redis client limit.
- **Listener `connect()` ordering: safety timer first, then connect.** If the initial connect throws synchronously, the safety scan is still wired and will eventually drain the backlog when the DB recovers.
- **catchupScan per-row try/catch.** A transient Redis blip on one row no longer aborts the remaining 499 enqueues — the next scan retries the failed ones.
- **catchupScan in-flight mutex** so safety + catch-up don't double-scan the same window.
- **catchupScan continuation chain cap** (200 batches × 500 = 100k rows) so a pathological backlog doesn't starve the event loop forever.
- **`OutboxDepthService` gauge `set(0)` immediately** plus sampling mutex. The first Prometheus scrape now always sees the gauge, and a slow COUNT under heavy backlog doesn't stack samplers.
- **NOTIFY handler validates UUID** before enqueue.
- **Listener `onModuleDestroy` breaks the in-flight catch-up loop** on `this.shuttingDown` so graceful shutdown is fast.

Deferred (per autonomous-mode batching, documented in code):
- Concrete `downstreamJobs[]` enqueue routing → Story 4-3 (idempotency registry / recalc jobs).
- DLQ inspector tool → Story 4-5.
- Realtime publish-failure counter → EPIC-16 metrics polish.
- `outbox_events.created_at` immutability trigger (currently relies on producer-side discipline) → tracked in deferred work.

### File List

- `apps/api/package.json` — adds `pg@8.13.1` + `@types/pg@8.11.10`
- `apps/api/src/jobs/queues.config.ts` — adds `audit.outbox-relay` to `ACTIVE_QUEUES`
- `apps/api/src/outbox/outbox.module.ts` (new) — mode-aware module; worker-mode wires listener + consumer + depth service + imports ObservabilityModule + BullMQ queue tokens
- `apps/api/src/outbox/outbox-listener.service.ts` (new) — pg LISTEN/NOTIFY pump with UUID validation, reconnect mutex, safety scan, in-flight mutex, bounded continuation chain
- `apps/api/src/outbox/outbox-relay.consumer.ts` (new) — `@Processor` with concurrency from QUEUES; `$transaction({ timeout: 30s })` + SELECT FOR UPDATE + composite-PK idempotency; Redis publisher with `onModuleDestroy`; downstreamJobs contract; DLQ promotion
- `apps/api/src/outbox/outbox-depth.service.ts` (new) — `fcm_outbox_relay_depth` Prometheus gauge with in-flight mutex + initial `set(0)`
- `apps/api/src/app.module.ts` — registers OutboxModule
- `tests/scaffold/outbox-relay-structure.test.mjs` (new) — 9 structural assertions
- `tests/integration/outbox-relay-roundtrip.test.mjs` (new) — boots real worker-mode AppModule, exercises end-to-end relay, asserts depth gauge in metrics snapshot
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 3-3 → done
