// Story 4-5 — DlqAdminService.list() + .replay() against a mock Queue.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { DlqAdminService } = await import('../dist/jobs/dlq-admin.service.js');

function makeQueue(initialJobs = []) {
  let jobs = [...initialJobs];
  const events = [];
  return {
    _events: events,
    _jobs: jobs,
    getJobCounts: async (..._states) => ({
      waiting: jobs.filter((j) => j._state === 'waiting').length,
      active: jobs.filter((j) => j._state === 'active').length,
    }),
    getJobs: async (_states, _start, _end) => jobs,
    getJob: async (id) => jobs.find((j) => j.id === id) ?? null,
    add: async (name, data, opts) => {
      const job = { id: opts?.jobId ?? `auto-${jobs.length}`, name, data, timestamp: Date.now(), _state: 'waiting' };
      jobs.push(job);
      events.push({ kind: 'add', name, data, opts });
      return job;
    },
  };
}

function makeSvcAllEmpty() {
  // Empty queues for every position. The service requires 14 InjectQueue args.
  const q = () => makeQueue();
  return new DlqAdminService(q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q());
}

function makeFailedJob(id, originalQueue, attemptsMade, reason) {
  return {
    id,
    name: 'recalc',
    data: {
      originalJobId: id,
      originalQueue,
      attemptsMade,
      failureReason: reason,
      data: { employeeId: 'emp-1' },
    },
    timestamp: 1716393600000, // 2024-05-22
    _state: 'waiting',
    remove: async function () {
      // Mark removed but keep in jobs array — the mock makes that easy.
    },
  };
}

test('list() returns empty DLQs when nothing is queued', async () => {
  const svc = makeSvcAllEmpty();
  const result = await svc.list();
  assert.equal(result.queues.length, 7);
  for (const q of result.queues) {
    assert.equal(q.depth, 0);
    assert.deepEqual(q.recentFailures, []);
  }
});

test('list() returns per-queue failures from the DLQ companion', async () => {
  const smokeMain = makeQueue();
  const smokeDlq = makeQueue([
    makeFailedJob('job-1', '__smoke', 3, 'simulated failure'),
    makeFailedJob('job-2', '__smoke', 3, 'another failure'),
  ]);
  const q = () => makeQueue();
  const svc = new DlqAdminService(
    smokeMain,
    smokeDlq,
    q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q(),
  );
  const result = await svc.list(10);
  const smoke = result.queues.find((q) => q.queue === '__smoke');
  assert.ok(smoke);
  assert.equal(smoke.depth, 2);
  assert.equal(smoke.recentFailures.length, 2);
  assert.equal(smoke.recentFailures[0].jobId, 'job-1');
  assert.equal(smoke.recentFailures[0].failureReason, 'simulated failure');
  assert.equal(smoke.recentFailures[0].originalQueue, '__smoke');
  assert.equal(smoke.recentFailures[0].attemptsMade, 3);
});

test('replay() re-adds the original payload to the main queue with a fresh jobId', async () => {
  const smokeMain = makeQueue();
  const failedJob = makeFailedJob('job-1', '__smoke', 3, 'boom');
  const smokeDlq = makeQueue([failedJob]);
  const q = () => makeQueue();
  const svc = new DlqAdminService(
    smokeMain,
    smokeDlq,
    q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q(),
  );
  const result = await svc.replay('__smoke', 'job-1');
  assert.match(result.newJobId, /^replay:job-1:\d+$/);
  assert.equal(smokeMain._events.length, 1);
  assert.equal(smokeMain._events[0].name, 'recalc');
  assert.deepEqual(smokeMain._events[0].data, { employeeId: 'emp-1' });
});

test('replay() rejects unknown DLQ jobIds with a clear error', async () => {
  const svc = makeSvcAllEmpty();
  await assert.rejects(
    () => svc.replay('__smoke', 'nonexistent'),
    /DLQ job 'nonexistent' not found/,
  );
});

test('replay() rejects DLQ jobs missing the original-data envelope', async () => {
  const malformedJob = {
    id: 'malformed',
    name: 'recalc',
    data: { /* no `data` field */ },
    timestamp: 1716393600000,
    _state: 'waiting',
    remove: async () => undefined,
  };
  const q = () => makeQueue();
  const smokeMain = makeQueue();
  const smokeDlq = makeQueue([malformedJob]);
  const svc = new DlqAdminService(
    smokeMain,
    smokeDlq,
    q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q(),
  );
  await assert.rejects(
    () => svc.replay('__smoke', 'malformed'),
    /has no original data payload/,
  );
});

test('replay() removes the DLQ entry only AFTER the main-queue add succeeds', async () => {
  // Simulate a main-queue add failure — verify the DLQ job is NOT removed.
  const failedJob = makeFailedJob('job-1', '__smoke', 3, 'boom');
  let removeCalled = false;
  failedJob.remove = async function () {
    removeCalled = true;
  };
  const smokeMain = {
    add: async () => {
      throw new Error('main queue add failed');
    },
  };
  const smokeDlq = makeQueue([failedJob]);
  const q = () => makeQueue();
  const svc = new DlqAdminService(
    smokeMain,
    smokeDlq,
    q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q(), q(),
  );
  await assert.rejects(() => svc.replay('__smoke', 'job-1'), /main queue add failed/);
  assert.equal(removeCalled, false, 'DLQ entry must NOT be removed when main-queue add fails');
});
