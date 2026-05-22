# Story 4.2: Domain queue definitions

Status: done

## Story

As a team,
I want all architecture-listed queues defined,
so that downstream epics don't block on missing plumbing.

## Acceptance Criteria

1. Queues `scoring.recalc-employee`, `scoring.recalc-org-bulk`, `evidence.expiry-scan`, `snapshot.partition-maintenance`, `notification.deliver`, `observability.client-metrics` exist with the per-queue settings in Arch §7.2.
2. Each queue exports a typed `enqueue<JobName>` helper from the jobs module; consumers are stubbed with an explicit "not-implemented" handler that throws.
3. Prometheus metrics emitted per queue: depth, processing-duration histogram, DLQ depth.

## Tasks / Subtasks

- [x] Task covering AC #1 — `ACTIVE_QUEUES` (queues.config.ts) extended from 3 → 8 entries; every architecture-listed queue is now registered via BullModule on api-mode boot AND worker-mode boot. The per-queue settings (concurrency, attempts, backoff, rate-limit, DLQ) were already declared in `QUEUES` and remain unchanged.
- [x] Task covering AC #2 — `enqueueScoringRecalcEmployee`, `enqueueScoringRecalcOrgBulk`, `enqueueEvidenceExpiryScan`, `enqueueSnapshotPartitionMaintenance`, `enqueueNotificationDeliver`, `enqueueObservabilityClientMetrics` exported from `apps/api/src/jobs/enqueue.ts`. Each wraps `queue.add(jobName, withActor(actor, data), { jobId })` with a deterministic `jobId` derived from the payload to coalesce duplicate enqueues. The five non-`__smoke`/non-`audit.outbox-relay` queues have stub consumers in `apps/api/src/jobs/stub-consumers/` that throw `NotImplementedError` naming the owning story.
- [x] Task covering AC #3 — `QueueMetricsService` (apps/api/src/jobs/queue-metrics.service.ts) registers three metrics against the shared Prometheus registry: `fcm_queue_depth{queue}` (gauge, sampled every 15s), `fcm_queue_dlq_depth{queue}` (gauge, sampled every 15s — emits `0` for queues with `dlq: null`), `fcm_queue_processing_duration_seconds{queue,outcome}` (histogram with buckets [0.01..120]). Consumers call `recordDuration(queue, outcome, seconds)` from their `OnWorkerEvent('completed'|'failed')` hooks to populate the histogram.

## Dev Notes

- Five new queues mean five new BullMQ Worker subscriptions per worker pod when API_MODE=worker. The stub consumers run at minimum concurrency (1–8 per Arch §7.2) so the Redis-connection overhead is bounded.
- The enqueue helpers' `jobId` strategy is part of the queue contract: producers can blindly re-enqueue without worrying about duplicate work because BullMQ's `add` is a no-op when the jobId already exists in the queue.
- `observability.client-metrics` does NOT take an ActorContext — telemetry is fire-and-forget from the browser, with a `sessionId` providing dedup identity.
- The `QueueMetricsService` is registered in both api-mode AND worker-mode so `/metrics` exposes uniform per-queue series regardless of which process the scraper hits.
- Architecture patterns and constraints to follow are captured in the References block below.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E4.1 (BullMQ module + worker bootstrap + per-queue configuration)

### References

- Arch §7.2 (queue catalog)
- NFR-6.4 (operational observability)
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m])

### Debug Log References

- `pnpm typecheck` — green (4 workspaces)
- `pnpm --filter @fcm/api test` — 91 pass + 1 skip (DATABASE_URL-gated RLS suite; +12 tests over Epic-2 baseline: 7 enqueue helper + 5 stub consumer + 1 NotImplementedError sanity)
- `pnpm test` — green across all workspaces

### Completion Notes List

- AC1: every queue registered. The smoke + outbox + partition-maintenance queues already shipped consumers in their owning stories (4-1, 3-3, 3-6); the five new queues use stub consumers until their owning stories ship.
- AC2: enqueue helpers take `(queue, actor, data)` (or `(queue, data)` for client-metrics) and produce a deterministic `jobId` per payload. Tests assert helpers call `queue.add` with the right name, the `withActor`-wrapped payload, and the right jobId.
- AC3: Three metric series exposed via the shared Prometheus registry. Stub consumers do NOT call `recordDuration` (they throw immediately); real consumers (4-1's SmokeConsumer, 3-3's OutboxRelayConsumer, etc.) will add the calls when they adopt the histogram.

### Deferred to follow-ups

- Hook the duration histogram into the existing real consumers (SmokeConsumer, OutboxRelayConsumer, PartitionMaintenanceConsumer). The helper is shipped; the call sites need a one-line addition each. Will land alongside Story 4-3 (idempotency registry) which touches the same consumer code.
- DLQ admin tool — Story 4-5 covers the operational surface (manual replay, depth alerting). This story only emits the depth metric.

### File List

- `apps/api/src/jobs/queues.config.ts` (modified) — ACTIVE_QUEUES extended from 3 → 8.
- `apps/api/src/jobs/jobs.module.ts` (modified) — register stub consumers in worker mode + QueueMetricsService in both modes; import ObservabilityModule for MetricsService.
- `apps/api/src/jobs/job-payloads.ts` (new) — typed payload shapes per queue.
- `apps/api/src/jobs/enqueue.ts` (new) — six typed enqueue helpers.
- `apps/api/src/jobs/queue-metrics.service.ts` (new) — depth + DLQ depth gauges + processing-duration histogram.
- `apps/api/src/jobs/stub-consumers/not-implemented.ts` (new) — shared `NotImplementedError`.
- `apps/api/src/jobs/stub-consumers/scoring-recalc-employee.consumer.ts` (new) — stub for queue owned by story 9-5.
- `apps/api/src/jobs/stub-consumers/scoring-recalc-org-bulk.consumer.ts` (new) — stub for queue owned by story 9-6.
- `apps/api/src/jobs/stub-consumers/evidence-expiry-scan.consumer.ts` (new) — stub for queue owned by story 8-7.
- `apps/api/src/jobs/stub-consumers/notification-deliver.consumer.ts` (new) — stub for queue owned by story 14-1.
- `apps/api/src/jobs/stub-consumers/observability-client-metrics.consumer.ts` (new) — stub for queue owned by story 11-8.
- `apps/api/test/enqueue-helpers.test.mjs` (new) — 7 tests covering AC2 (jobId scheme, actor propagation, telemetry-no-actor path, round-trip via actorFromJobData).
- `apps/api/test/stub-consumers.test.mjs` (new) — 6 tests asserting each stub throws NotImplementedError with the correct queue + owning story.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — 4-2 → done.
