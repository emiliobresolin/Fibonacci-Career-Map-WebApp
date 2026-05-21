// Scaffold guardrail: verifies the partition-maintenance surface defined
// by Story 3-6 (Arch §6.4 / AR-8).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const apiSrc = resolve(root, 'apps/api/src');

test('PartitionsModule + consumer + scheduler + lookahead service files exist', () => {
  for (const f of [
    'partitions.module.ts',
    'partition-maintenance.consumer.ts',
    'partition-maintenance.scheduler.ts',
    'partition-lookahead.service.ts',
  ]) {
    assert.ok(existsSync(resolve(apiSrc, 'partitions', f)), `apps/api/src/partitions/${f} must exist`);
  }
});

test('snapshot.partition-maintenance is in ACTIVE_QUEUES (AC1)', () => {
  const cfg = readFileSync(resolve(apiSrc, 'jobs/queues.config.ts'), 'utf8');
  assert.match(
    cfg,
    /ACTIVE_QUEUES[\s\S]*?'snapshot\.partition-maintenance'/,
    "snapshot.partition-maintenance must be in ACTIVE_QUEUES so the queue+consumer wire up (AC1)",
  );
});

test('AppModule wires PartitionsModule with mode threading', () => {
  const app = readFileSync(resolve(apiSrc, 'app.module.ts'), 'utf8');
  assert.match(app, /PartitionsModule\.register\(\s*\{\s*mode:\s*opts\.mode\s*\}\s*\)/, 'AppModule must register PartitionsModule (AC1)');
});

test('Scheduler registers a weekly cron with a stable jobId (AC1 + AC2 idempotency)', () => {
  const src = readFileSync(resolve(apiSrc, 'partitions/partition-maintenance.scheduler.ts'), 'utf8');
  // Weekly cron pattern.
  assert.match(src, /['"]0 0 \* \* 0['"]/, 'cron pattern must be weekly (Sun 00:00 UTC) (AC1)');
  // Stable jobId so a worker restart / second replica doesn\'t double-up.
  assert.match(src, /jobId:\s*['"]partition-maintenance:cron['"]/, 'repeatable job must have a stable jobId (AC2)');
  // Boot-time one-shot so first deployment doesn\'t wait a week.
  assert.match(src, /jobId:\s*['"]partition-maintenance:boot['"]/, 'boot job must have its own jobId (AC2)');
});

test('Consumer creates partitions via CREATE TABLE IF NOT EXISTS PARTITION OF (AC1 + AC2)', () => {
  const src = readFileSync(resolve(apiSrc, 'partitions/partition-maintenance.consumer.ts'), 'utf8');
  assert.match(src, /CREATE TABLE IF NOT EXISTS/, 'must use IF NOT EXISTS for idempotency (AC2)');
  assert.match(src, /PARTITION OF\s+"audit_events"/, 'must declare each table as PARTITION OF audit_events (AC1)');
  assert.match(src, /REVOKE TRUNCATE ON/, 'must REVOKE TRUNCATE on each new partition (Story 3-1 invariant)');
  // 3-month lookahead.
  assert.match(src, /LOOKAHEAD_MONTHS\s*=\s*3/, 'must declare LOOKAHEAD_MONTHS = 3 (AR-8)');
});

test('PartitionLookaheadService emits fcm_audit_partition_lookahead_months (AC3)', () => {
  const src = readFileSync(resolve(apiSrc, 'partitions/partition-lookahead.service.ts'), 'utf8');
  assert.match(src, /name:\s*'fcm_audit_partition_lookahead_months'/, 'gauge name must match AC3 spec');
  // Lookahead counts CONSECUTIVE present months — a gap caps the count
  // (so the alert fires correctly when month 2 is missing but month 3
  // somehow exists).
  assert.match(src, /consecutive/i, 'lookahead must count consecutive months from now()');
});

test('Runbook stub exists at docs/ops/runbooks/audit-partition.md (AC3)', () => {
  const runbook = resolve(root, 'docs/ops/runbooks/audit-partition.md');
  assert.ok(existsSync(runbook), 'docs/ops/runbooks/audit-partition.md must exist (AC3)');
  const src = readFileSync(runbook, 'utf8');
  assert.match(src, /fcm_audit_partition_lookahead_months/, 'runbook must reference the metric');
  assert.match(src, /CREATE TABLE IF NOT EXISTS/, 'runbook must document the create-if-missing pattern');
});

test('Unit tests for the pure month helpers exist (idempotency support)', () => {
  const unit = resolve(root, 'apps/api/test/partition-month-helpers.test.mjs');
  assert.ok(existsSync(unit), 'unit tests for nextMonths/nextMonthYM must exist');
});
