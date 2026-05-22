// Story 4-2 — typed enqueue helpers (AC2). Each helper wraps a queue.add
// call with deterministic jobId + ActorContext propagation.
//
// Tests are pure unit tests against a captured Queue mock. No live Redis
// or BullMQ is required.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  enqueueScoringRecalcEmployee,
  enqueueScoringRecalcOrgBulk,
  enqueueEvidenceExpiryScan,
  enqueueSnapshotPartitionMaintenance,
  enqueueNotificationDeliver,
  enqueueObservabilityClientMetrics,
} = await import('../dist/jobs/enqueue.js');

const ACTOR = {
  user_id: '11111111-1111-1111-1111-111111111111',
  organization_id: '22222222-2222-2222-2222-222222222222',
  role: 'ADMIN',
  display_name: 'Test Actor',
};

const EMPLOYEE = '33333333-3333-3333-3333-333333333333';
const NOTIF = '44444444-4444-4444-4444-444444444444';
const RECIPIENT = '55555555-5555-5555-5555-555555555555';

function makeQueue() {
  const calls = [];
  return {
    add: async (name, data, opts) => {
      calls.push({ name, data, opts });
      return { id: opts?.jobId ?? 'auto' };
    },
    _calls: calls,
  };
}

// ── scoring.recalc-employee ────────────────────────────────────────

test('enqueueScoringRecalcEmployee wraps payload with actor + deterministic jobId', async () => {
  const q = makeQueue();
  await enqueueScoringRecalcEmployee(q, ACTOR, {
    employeeId: EMPLOYEE,
    trigger: 'evidence.approved',
  });
  assert.equal(q._calls.length, 1);
  const c = q._calls[0];
  assert.equal(c.name, 'recalc');
  assert.deepEqual(c.data.actor, ACTOR, 'actor must be propagated into job payload');
  assert.equal(c.data.employeeId, EMPLOYEE);
  assert.equal(c.data.trigger, 'evidence.approved');
  assert.equal(c.opts.jobId, `recalc:${EMPLOYEE}:evidence.approved`);
});

// ── scoring.recalc-org-bulk ─────────────────────────────────────────

test('enqueueScoringRecalcOrgBulk keys jobId on (org, trigger) to coalesce bursts', async () => {
  const q = makeQueue();
  await enqueueScoringRecalcOrgBulk(q, ACTOR, { trigger: 'configuration.changed' });
  await enqueueScoringRecalcOrgBulk(q, ACTOR, { trigger: 'configuration.changed' });
  // Both calls produce the same jobId — BullMQ coalesces duplicates
  // (the mock just records them; the dedup happens in BullMQ).
  assert.equal(q._calls[0].opts.jobId, q._calls[1].opts.jobId);
  assert.match(q._calls[0].opts.jobId, /^recalc-bulk:22222222/);
});

// ── evidence.expiry-scan ────────────────────────────────────────────

test('enqueueEvidenceExpiryScan jobId includes calendar day for once-per-day semantics', async () => {
  const q = makeQueue();
  await enqueueEvidenceExpiryScan(q, ACTOR, { lookaheadDays: 30 });
  assert.equal(q._calls[0].name, 'scan');
  assert.match(q._calls[0].opts.jobId, /^scan:22222222.*:\d{4}-\d{2}-\d{2}$/);
  assert.equal(q._calls[0].data.lookaheadDays, 30);
});

// ── snapshot.partition-maintenance ──────────────────────────────────

test('enqueueSnapshotPartitionMaintenance jobId is derived from the anchor day', async () => {
  const q = makeQueue();
  await enqueueSnapshotPartitionMaintenance(q, ACTOR, { anchor: '2026-05-22T00:00:00.000Z' });
  assert.equal(q._calls[0].name, 'maintain');
  assert.equal(q._calls[0].opts.jobId, 'maintain:2026-05-22');
});

// ── notification.deliver ────────────────────────────────────────────

test('enqueueNotificationDeliver jobId scopes on (notificationId, recipient)', async () => {
  const q = makeQueue();
  await enqueueNotificationDeliver(q, ACTOR, {
    notificationId: NOTIF,
    recipientUserId: RECIPIENT,
    channels: ['in_app', 'email'],
  });
  assert.equal(q._calls[0].name, 'deliver');
  assert.equal(q._calls[0].opts.jobId, `deliver:${NOTIF}:${RECIPIENT}`);
});

// ── observability.client-metrics (no actor required) ────────────────

test('enqueueObservabilityClientMetrics does NOT require an actor — telemetry path', async () => {
  const q = makeQueue();
  await enqueueObservabilityClientMetrics(q, {
    sessionId: 'session-abc-123',
    metrics: { fps: 60, heapMb: 250 },
  });
  assert.equal(q._calls[0].name, 'record');
  assert.equal(q._calls[0].opts.jobId, 'record:session-abc-123');
  assert.equal(q._calls[0].data.actor, undefined, 'observability payload carries NO actor');
});

// ── ActorContext round-trip via actorFromJobData ────────────────────

test('jobs enqueued via the helpers round-trip the actor through actorFromJobData', async () => {
  const { actorFromJobData } = await import('../dist/auth/actor-context.js');
  const q = makeQueue();
  await enqueueScoringRecalcEmployee(q, ACTOR, {
    employeeId: EMPLOYEE,
    trigger: 'manual',
  });
  const extracted = actorFromJobData(q._calls[0].data);
  assert.deepEqual(extracted, ACTOR);
});
