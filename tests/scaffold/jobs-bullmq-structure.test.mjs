// Scaffold guardrail: verifies the BullMQ jobs surface defined by Story 4-1
// (Arch §7.1, §7.2, AD-5).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const api = resolve(root, 'apps/api');
const apiSrc = resolve(api, 'src');

test('apps/api declares @nestjs/bullmq + bullmq + ioredis', () => {
  const pkg = JSON.parse(readFileSync(resolve(api, 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.ok(deps['@nestjs/bullmq'], '@nestjs/bullmq must be installed (AC1)');
  assert.ok(deps['bullmq'], 'bullmq must be installed (AC1)');
  assert.ok(deps['ioredis'], 'ioredis must be installed (AC1 — BullMQ Redis client)');
});

test('env.config.ts validates REDIS_URL (production-required)', () => {
  const env = readFileSync(resolve(apiSrc, 'common/env.config.ts'), 'utf8');
  assert.match(env, /REDIS_URL/, 'env must declare REDIS_URL (AC1)');
  assert.match(
    env,
    /REDIS_URL is required when NODE_ENV=production/,
    'env must promote REDIS_URL to required in production',
  );
});

test('JobsModule + QueuesConfig + SmokeConsumer files exist', () => {
  for (const f of ['jobs.module.ts', 'queues.config.ts', 'smoke.consumer.ts']) {
    assert.ok(existsSync(resolve(apiSrc, 'jobs', f)), `apps/api/src/jobs/${f} must exist`);
  }
});

test('QueuesConfig declares the seven domain queues from Arch §7.2 + __smoke', () => {
  const src = readFileSync(resolve(apiSrc, 'jobs/queues.config.ts'), 'utf8');
  for (const q of [
    '__smoke',
    'audit.outbox-relay',
    'scoring.recalc-employee',
    'scoring.recalc-org-bulk',
    'evidence.expiry-scan',
    'snapshot.partition-maintenance',
    'notification.deliver',
    'observability.client-metrics',
  ]) {
    assert.ok(src.includes(`'${q}'`), `QueuesConfig must declare queue '${q}' (AC1)`);
  }
  // Each queue entry must declare concurrency, maxAttempts, backoff, dlq.
  for (const field of ['concurrency', 'maxAttempts', 'backoff', 'dlq']) {
    assert.match(src, new RegExp(`${field}:`), `QueueDef must declare ${field} (AC1)`);
  }
});

test('ACTIVE_QUEUES gates which queues open ioredis connections (4-1 ships __smoke only)', () => {
  const src = readFileSync(resolve(apiSrc, 'jobs/queues.config.ts'), 'utf8');
  assert.match(src, /ACTIVE_QUEUES\s*:\s*readonly QueueName\[\]\s*=\s*\[\s*'__smoke'\s*\]/, 'Story 4-1 only opens connections for __smoke; future stories extend ACTIVE_QUEUES alongside their producer/consumer');
});

test('JobsModule.register({ mode }) gates consumers on worker mode (AC2)', () => {
  const src = readFileSync(resolve(apiSrc, 'jobs/jobs.module.ts'), 'utf8');
  assert.match(
    src,
    /static\s+register\s*\(\s*opts:\s*\{\s*mode:\s*'api'\s*\|\s*'worker'\s*\}\s*\)\s*:\s*DynamicModule/,
    'JobsModule must expose register({ mode }) (AC2)',
  );
  assert.match(
    src,
    /opts\.mode\s*===\s*'worker'\s*\?\s*\[\s*SmokeConsumer\s*\]\s*:\s*\[\s*\]/,
    'Consumer providers must be gated on worker mode (AC2)',
  );
  // Production worker mode demands a real REDIS_URL — no localhost fallback.
  assert.match(
    src,
    /opts\.mode\s*===\s*'worker'\s*&&\s*nodeEnv\s*===\s*'production'\s*&&\s*!redisUrl/,
    'production worker mode must throw when REDIS_URL is unset (no silent localhost fallback)',
  );
  // BullMQ Redis hardening.
  assert.match(src, /maxRetriesPerRequest:\s*null/, 'connection must set maxRetriesPerRequest: null for blocking-client resilience');
  assert.match(src, /enableReadyCheck:\s*false/, 'connection must set enableReadyCheck: false to avoid spurious READONLY on failover');
});

test('AppModule is a DynamicModule that passes mode to JobsModule', () => {
  const app = readFileSync(resolve(apiSrc, 'app.module.ts'), 'utf8');
  assert.match(app, /static\s+register\s*\(\s*opts:\s*\{\s*mode:\s*ApiMode\s*\}\s*\)\s*:\s*DynamicModule/, 'AppModule.register must accept mode (AC2)');
  assert.match(app, /JobsModule\.register\(\s*\{\s*mode:\s*opts\.mode\s*\}\s*\)/, 'AppModule must forward mode to JobsModule');
});

test('main.ts boots via AppModule.register({ mode: env.API_MODE })', () => {
  const main = readFileSync(resolve(apiSrc, 'main.ts'), 'utf8');
  assert.match(main, /AppModule\.register\(\s*\{\s*mode:\s*env\.API_MODE\s*\}\s*\)/, 'main.ts must pass Zod-validated env.API_MODE');
});

test('SmokeConsumer wires concurrency via @Processor decorator + DLQ via @InjectQueue + idempotent failed-routing (AC1 + AC3)', () => {
  const src = readFileSync(resolve(apiSrc, 'jobs/smoke.consumer.ts'), 'utf8');
  // Worker options on @Processor — the only place BullMQ reads concurrency
  // and limiter. Without these the QueueDef values are dead config.
  assert.match(
    src,
    /@Processor\(\s*SMOKE_QUEUE\s*,\s*\{\s*concurrency:\s*QUEUES\[SMOKE_QUEUE\]\.concurrency/,
    'SmokeConsumer must pass concurrency from QueuesConfig to @Processor (AC1)',
  );
  assert.match(src, /@InjectQueue\(SMOKE_DLQ\)/, 'SmokeConsumer must inject the DLQ via the shared SMOKE_DLQ constant (AC3)');
  assert.match(src, /@OnWorkerEvent\(\s*'failed'\s*\)/, 'SmokeConsumer must subscribe to failed event (AC3)');
  // Idempotent DLQ promotion via deterministic jobId derived from original job.
  assert.match(src, /jobId:\s*dlqJobId/, 'DLQ add must use a deterministic jobId so duplicate failed-events do not double-promote');
  // Terminal-failure gate + missing-id defensive check.
  assert.match(src, /attemptsMade\s*<\s*\(\s*job\.opts\.attempts\s*\?\?/, 'failed-handler must gate on non-terminal attempts (AC3)');
  assert.match(src, /if\s*\(\s*!job\.id\s*\)/, 'failed-handler must assert job.id is defined before DLQ-routing');
  // try/catch around dlq.add so a Redis blip on DLQ promotion is logged, not crashed.
  assert.match(src, /catch\s*\(\s*dlqErr\b/, 'DLQ add must be in try/catch — transient Redis failures should not crash the worker');
});

test('Integration test for AC3 (smoke + DLQ) exists', () => {
  const integ = resolve(root, 'tests/integration/jobs-bullmq-smoke.test.mjs');
  assert.ok(existsSync(integ), 'AC3 integration test must exist (skips when REDIS_URL unset)');
});
