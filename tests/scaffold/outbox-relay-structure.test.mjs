// Scaffold guardrail: verifies the outbox relay surface defined by
// Story 3-3 (Arch §9.3, AD-7).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const api = resolve(root, 'apps/api');
const apiSrc = resolve(api, 'src');

test('apps/api declares pg + @types/pg', () => {
  const pkg = JSON.parse(readFileSync(resolve(api, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['pg'], 'pg must be installed (AC1 — LISTEN/NOTIFY needs raw pg client)');
  assert.ok(pkg.devDependencies['@types/pg'], '@types/pg must be installed');
});

test('OutboxModule + OutboxListenerService + OutboxRelayConsumer + OutboxDepthService files exist', () => {
  for (const f of [
    'outbox.module.ts',
    'outbox-listener.service.ts',
    'outbox-relay.consumer.ts',
    'outbox-depth.service.ts',
  ]) {
    assert.ok(existsSync(resolve(apiSrc, 'outbox', f)), `apps/api/src/outbox/${f} must exist`);
  }
});

test('AppModule wires OutboxModule with mode threading', () => {
  const app = readFileSync(resolve(apiSrc, 'app.module.ts'), 'utf8');
  assert.match(app, /OutboxModule\.register\(\s*\{\s*mode:\s*opts\.mode\s*\}\s*\)/, 'AppModule must register OutboxModule with the mode (AC1)');
});

test('OutboxModule registers consumer + listener providers only in worker mode (AC1)', () => {
  const mod = readFileSync(resolve(apiSrc, 'outbox/outbox.module.ts'), 'utf8');
  assert.match(mod, /if\s*\(\s*opts\.mode\s*!==\s*'worker'\s*\)/, 'OutboxModule must short-circuit in api mode');
  for (const provider of ['OutboxListenerService', 'OutboxRelayConsumer', 'OutboxDepthService']) {
    assert.match(mod, new RegExp(provider), `OutboxModule must provide ${provider} in worker mode`);
  }
});

test('audit.outbox-relay is in ACTIVE_QUEUES (AC1)', () => {
  const cfg = readFileSync(resolve(apiSrc, 'jobs/queues.config.ts'), 'utf8');
  assert.match(
    cfg,
    /ACTIVE_QUEUES[\s\S]*?'audit\.outbox-relay'/,
    "audit.outbox-relay must be in ACTIVE_QUEUES so the BullModule connection is opened",
  );
});

test('OutboxListenerService LISTENs on outbox_new + maintains catch-up + reconnect (AC1)', () => {
  const src = readFileSync(resolve(apiSrc, 'outbox/outbox-listener.service.ts'), 'utf8');
  assert.match(src, /from\s+'pg'/, 'must import the pg client (AC1 — LISTEN needs raw pg)');
  assert.match(src, /LISTEN\s+\$\{[^}]*CHANNEL\}/, 'must issue LISTEN against the outbox_new channel');
  assert.match(src, /'outbox_new'/, "channel must be 'outbox_new' (matches Story 3-2 trigger)");
  // Idempotent enqueue: jobId === eventId. This is the only way duplicate
  // NOTIFYs (or catch-up rediscoveries) coalesce in BullMQ before the
  // consumer ever runs.
  assert.match(src, /jobId:\s*eventId/, 'enqueue must use jobId=eventId for idempotency (AC3)');
  // Catch-up scan on connect + periodic safety scan independent of NOTIFY.
  assert.match(src, /catchupScan/, 'must perform catch-up scan to recover from missed NOTIFYs');
  assert.match(src, /safetyScan|SAFETY_SCAN_INTERVAL_MS/, 'must run a periodic safety scan');
  // Reconnect path with backoff cap.
  assert.match(src, /scheduleReconnect|RECONNECT_MAX_DELAY_MS/, 'must implement bounded-backoff reconnect');
});

test('OutboxRelayConsumer is idempotent + transactional + DLQ-routed (AC2 + AC3 + AC4)', () => {
  const src = readFileSync(resolve(apiSrc, 'outbox/outbox-relay.consumer.ts'), 'utf8');
  assert.match(src, /@Processor\(\s*QUEUE\s*,\s*\{\s*concurrency:\s*QUEUES\[QUEUE\]\.concurrency/, 'must pass concurrency via @Processor');
  assert.match(src, /\$transaction/, 'audit + outbox writes must run in one Prisma transaction (AC2)');
  // Idempotency layer 1: skip when publishedAt already set.
  assert.match(src, /publishedAt\s*!==\s*null/, 'must skip already-published rows (AC3 layer 1)');
  // Idempotency layer 2: P2002 on duplicate audit_events INSERT is non-fatal.
  assert.match(src, /P2002/, 'must catch duplicate audit INSERT (AC3 layer 2)');
  // Audit INSERT writes to the partitioned audit_events table via raw SQL
  // (audit_events has a composite (id, occurred_at) PK that Prisma can't model cleanly).
  assert.match(src, /INSERT INTO\s+"audit_events"/, 'must INSERT into audit_events (AC2)');
  // DLQ promotion on terminal failure.
  assert.match(src, /@OnWorkerEvent\(\s*'failed'\s*\)/, 'must promote terminal failures to DLQ (AC4)');
  assert.match(src, /jobId:\s*dlqJobId/, 'DLQ promotion must be idempotent via deterministic jobId');
});

test('OutboxDepthService emits fcm_outbox_relay_depth gauge (AC4)', () => {
  const src = readFileSync(resolve(apiSrc, 'outbox/outbox-depth.service.ts'), 'utf8');
  assert.match(src, /from\s+'prom-client'/, 'must depend on prom-client (AC4)');
  assert.match(src, /name:\s*'fcm_outbox_relay_depth'/, "gauge must be named 'fcm_outbox_relay_depth' (AC4)");
  assert.match(src, /publishedAt:\s*null/, 'depth = count of unpublished outbox rows');
});

test('Integration test for outbox-relay round-trip exists', () => {
  const integ = resolve(root, 'tests/integration/outbox-relay-roundtrip.test.mjs');
  assert.ok(existsSync(integ), 'AC2/AC3 integration test must exist');
});
