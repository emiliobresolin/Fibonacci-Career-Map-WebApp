# Story 4.1: BullMQ module, worker bootstrap, and per-queue configuration

Status: done

## Story

As an engineer,
I want `@nestjs/bullmq` wired into the worker with per-queue concurrency/backoff/DLQ defaults,
so that later consumers plug in cleanly.

## Acceptance Criteria

1. `JobsModule` loads queue configuration from a typed `QueuesConfig` map (name, concurrency, backoff, maxAttempts, rateLimit, DLQ target).
2. Worker process registers consumers only when running in worker mode.
3. A smoke test enqueues a no-op job and asserts completion; failed test job lands in the DLQ after exhausting retries.

## Tasks / Subtasks

- [x] Task covering AC #1 — `QUEUES` typed catalog (queues.config.ts) declaring all 8 queues from Arch §7.2 with concurrency, backoff (type + delay + maxBackoffMs cap), maxAttempts, optional rateLimit, and DLQ target. ACTIVE_QUEUES gates which entries open ioredis connections (Story 4-1 ships `__smoke` only; future stories extend the set with their producer/consumer pair).
- [x] Task covering AC #2 — `AppModule.register({ mode })` → `JobsModule.register({ mode })` chain reads the Zod-validated `env.API_MODE` from `main.ts` and threads it through as an explicit input. Consumer providers are only registered when `mode === 'worker'`; producer-side queue registration is mode-agnostic so the api can enqueue.
- [x] Task covering AC #3 — Integration test bootstraps the actual worker-mode application context, resolves the `__smoke` Queue via `getQueueToken`, enqueues a `noop` job and asserts completion via `SmokeConsumer.process`, then enqueues a `fail` job and asserts a DLQ entry appears at `from:<originalJobId>` with `attemptsMade === 3` (proving BullMQ actually retried).

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E1.2
- E1.5

### References

- Arch §7.1, §7.2
- AD-5
- [Source: planning-artifacts/stories.md — index entry for this story]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via bmad-dev-story.

### Debug Log References

- 149/149 scaffold tests passing
- `pnpm -r run typecheck` clean
- Three-layer adversarial review batched into a single fix pass; reviewers caught several real defects that would have shipped without it.

### Completion Notes List

Initial implementation: BullMQ deps (`@nestjs/bullmq@10.2.3`, `bullmq@5.34.10`, `ioredis@5.4.2`), env REDIS_URL declaration with production superRefine, QueuesConfig typed catalog, JobsModule, SmokeConsumer, scaffold + integration tests.

Review-batch patches (applied pre-commit):

- **`concurrency` and `rateLimit` now actually wire to the Worker.** Original code declared both fields in `QueueDef` but never read them — they belong to BullMQ's WorkerOptions, not Queue defaultJobOptions. SmokeConsumer now passes them through the `@Processor(SMOKE_QUEUE, { concurrency, limiter })` decorator argument. Every future domain consumer follows the same pattern.
- **`maxRetriesPerRequest: null` + `enableReadyCheck: false` on the BullMQ connection.** Without these, workers crash-loop on Redis disconnect (BullMQ's blocking BRPOPLPUSH commands need an unbounded retry budget on the consumer connection). Critical for Redis-failover resilience.
- **API_MODE deferred-resolution.** Old shape read `process.env['API_MODE']` at module-load time (before `validateEnv` had run) and silently coerced any non-`'worker'` value into `'api'` mode — a `API_MODE=Worker` typo would silently boot in api-mode with no consumers. AppModule is now a `DynamicModule` whose `register({ mode })` takes the validated env value from `main.ts`. Tests that boot AppModule directly do the same.
- **Production worker-mode demands REDIS_URL.** Old fallback to `localhost:6379` could leak into a misconfigured staging worker silently. Now `nodeEnv === 'production' && opts.mode === 'worker' && !redisUrl` throws at factory time as defense-in-depth (production env-validation already enforces it via superRefine; this is the second layer).
- **Only `__smoke` + `__smoke.dlq` open ioredis connections in this story.** Old code registered all 8 queues, opening 8 unused connections per api-mode boot. `ACTIVE_QUEUES` is the runtime gate; the `QUEUES` config remains the source of truth, and future stories extend `ACTIVE_QUEUES` alongside their producer/consumer pair.
- **`maxAttempts: 'infinite'` replaced with `100` + `maxBackoffMs: 5min` cap on the outbox-relay queue.** Original 1M-attempt encoding combined with exponential backoff overflows `setTimeout`'s ms budget around attempt 25, so "retry forever" was a fiction. Honest cap + DLQ-depth Prometheus alert is the operational signal.
- **Idempotent DLQ promotion via deterministic `jobId: from:<originalJobId>`.** A failed-event firing twice for the same terminal job (worker reconnect/replay) no longer produces duplicate DLQ entries — the second `add()` returns the existing entry.
- **`dlq.add` wrapped in try/catch.** A transient Redis blip on DLQ promotion is now logged at error level rather than crashing the worker. The original job remains in the main queue's failed-set for forensic context.
- **`!job.id` defensive check.** Bull's `Job.id` is `string | undefined` at the type level. Guard against the unrouteable case explicitly rather than propagating `undefined` into the DLQ payload.
- **`removeOnComplete` on DLQs** so DLQ jobs don't accumulate forever — 30-day / 50k cap with manual triage in MVP.
- **Integration test rewrite — boots the actual worker-mode AppModule.** Old test used a hand-rolled `bull.Worker` that mirrored `SmokeConsumer.onFailed` — it was testing BullMQ itself, not our code. New test bootstraps `NestFactory.createApplicationContext(AppModule.register({ mode: 'worker' }))`, resolves `__smoke` + `__smoke.dlq` via `getQueueToken`, enqueues through the real producer, and asserts the real consumer's DLQ promotion (with `attemptsMade === 3` proving retries actually fired). Skips honestly via `t.skip` when REDIS_URL is unset OR when the api dist build is absent — neither is reported as a false-positive pass.
- **JobsModule now exports queue registrations.** Without `exports`, downstream modules couldn't `@InjectQueue('audit.outbox-relay')` (future) — they'd fail at boot with cryptic UnknownDependenciesException. Foundation for Story 3-3 onward.
- **Scaffold test tightening.** Asserts that ACTIVE_QUEUES contains only `__smoke`, that the SmokeConsumer wires concurrency via `@Processor`, that the worker-mode REDIS_URL throw is wired, that the BullMQ resilience knobs (`maxRetriesPerRequest`, `enableReadyCheck`) are set, and that `AppModule.register` is the entry point.

Acknowledged but deferred (per autonomous-mode batching):
- Per-queue env overrides (e.g. `WORKER_SCORING_CONCURRENCY`) — `BullModule.registerQueueAsync` factory takes no inject array today; the override pattern lands alongside the first story that needs it.
- DLQ inspection tooling / admin re-enqueue → Story 4-5 (internal DLQ admin tool).
- SIGTERM-during-active-job integration coverage → ops-readiness work alongside Story 16-x.

### File List

- `apps/api/package.json` — adds `@nestjs/bullmq@10.2.3`, `bullmq@5.34.10`, `ioredis@5.4.2`
- `apps/api/src/common/env.config.ts` — adds REDIS_URL + production superRefine
- `apps/api/src/jobs/queues.config.ts` (new) — typed `QUEUES` catalog + `ACTIVE_QUEUES` + `dlqOf`
- `apps/api/src/jobs/jobs.module.ts` (new) — `JobsModule.register({ mode })`, registers only ACTIVE_QUEUES, BullMQ connection hardening
- `apps/api/src/jobs/smoke.consumer.ts` (new) — `@Processor(SMOKE_QUEUE, { concurrency, limiter })`, idempotent DLQ promotion, try/catch on add
- `apps/api/src/app.module.ts` — converted to `DynamicModule` with `register({ mode })`
- `apps/api/src/main.ts` — passes `env.API_MODE` to `AppModule.register`
- `tests/scaffold/jobs-bullmq-structure.test.mjs` (new) — 9 structural assertions
- `tests/integration/jobs-bullmq-smoke.test.mjs` (new) — boots real worker-mode AppModule, exercises SmokeConsumer end-to-end
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 4-1 → done
