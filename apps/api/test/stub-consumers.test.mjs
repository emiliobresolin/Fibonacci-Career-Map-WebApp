// Story 4-2 — stub consumer behavior (AC2). Each stub consumer's
// process() throws a NotImplementedError naming the owning story.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { NotImplementedError } = await import('../dist/jobs/stub-consumers/not-implemented.js');

const STUBS = [
  {
    file: '../dist/jobs/stub-consumers/scoring-recalc-employee.consumer.js',
    cls: 'ScoringRecalcEmployeeStubConsumer',
    queue: 'scoring.recalc-employee',
    story: '9-5',
  },
  {
    file: '../dist/jobs/stub-consumers/scoring-recalc-org-bulk.consumer.js',
    cls: 'ScoringRecalcOrgBulkStubConsumer',
    queue: 'scoring.recalc-org-bulk',
    story: '9-6',
  },
  {
    file: '../dist/jobs/stub-consumers/evidence-expiry-scan.consumer.js',
    cls: 'EvidenceExpiryScanStubConsumer',
    queue: 'evidence.expiry-scan',
    story: '8-7',
  },
  {
    file: '../dist/jobs/stub-consumers/notification-deliver.consumer.js',
    cls: 'NotificationDeliverStubConsumer',
    queue: 'notification.deliver',
    story: '14-1',
  },
  {
    file: '../dist/jobs/stub-consumers/observability-client-metrics.consumer.js',
    cls: 'ObservabilityClientMetricsStubConsumer',
    queue: 'observability.client-metrics',
    story: '11-8',
  },
];

for (const stub of STUBS) {
  test(`${stub.cls}.process() throws NotImplementedError naming queue + story ${stub.story}`, async () => {
    const mod = await import(stub.file);
    const Consumer = mod[stub.cls];
    // Stub consumer extends WorkerHost. Skip super() concerns by calling
    // process() on a freshly-constructed instance.
    const c = Object.create(Consumer.prototype);
    await assert.rejects(
      () => c.process({ data: {}, name: 'noop' }),
      (err) => {
        assert.ok(err instanceof NotImplementedError, `expected NotImplementedError, got ${err.constructor.name}`);
        assert.equal(err.code, 'CONSUMER_NOT_IMPLEMENTED');
        assert.equal(err.queue, stub.queue);
        assert.equal(err.owningStory, stub.story);
        return true;
      },
    );
  });
}

test('NotImplementedError preserves instanceof across compilation boundary', () => {
  const e = new NotImplementedError('q.example', '9-5');
  assert.ok(e instanceof NotImplementedError);
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'NotImplementedError');
  assert.match(e.message, /q\.example/);
  assert.match(e.message, /Story 9-5/);
});
