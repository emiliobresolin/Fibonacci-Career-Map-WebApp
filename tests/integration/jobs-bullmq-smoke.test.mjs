// Story 4-1 AC3: smoke test that enqueues a no-op job through the actual
// JobsModule + SmokeConsumer and asserts:
//   1. The noop job completes via the real consumer.
//   2. A failing job lands in the __smoke.dlq queue AFTER exhausting its
//      configured retries (attemptsMade === maxAttempts).
//
// Boots the actual NestJS worker-mode application context — not a hand-
// rolled BullMQ Worker. That's the whole point of the AC: a regression in
// SmokeConsumer.onFailed (or in JobsModule.register) must surface here.
//
// Runs against a live Redis when REDIS_URL is set; reported as SKIPPED
// (not silently passed) when REDIS_URL is unset.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const REDIS_URL = process.env.REDIS_URL;
const TIMEOUT_MS = 15_000;

async function loadWorkerApp() {
  // Late-imported so the module load doesn't fail when DATABASE_URL or
  // other unrelated envs are absent in scaffold runs. The tests skip
  // before reaching this anyway.
  const [{ NestFactory }, { AppModule }, { getQueueToken }] = await Promise.all([
    import('@nestjs/core'),
    import('../../apps/api/dist/app.module.js'),
    import('@nestjs/bullmq'),
  ]);
  const appModule = AppModule.register({ mode: 'worker' });
  const app = await NestFactory.createApplicationContext(appModule, { bufferLogs: true });
  await app.init();
  const smoke = app.get(getQueueToken('__smoke'));
  const dlq = app.get(getQueueToken('__smoke.dlq'));
  return { app, smoke, dlq };
}

function waitForJobState(queue, jobId, state, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = async () => {
      try {
        const job = await queue.getJob(jobId);
        if (job) {
          const currentState = await job.getState();
          if (currentState === state) {
            resolve(job);
            return;
          }
        }
        if (Date.now() > deadline) {
          reject(new Error(`timed out waiting for job ${jobId} to reach state '${state}'`));
          return;
        }
        setTimeout(tick, 50);
      } catch (err) {
        reject(err);
      }
    };
    void tick();
  });
}

function waitForDlqEntry(dlqQueue, originalJobId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = async () => {
      try {
        const job = await dlqQueue.getJob(`from:${originalJobId}`);
        if (job) {
          resolve(job);
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error(`timed out waiting for DLQ entry from:${originalJobId}`));
          return;
        }
        setTimeout(tick, 50);
      } catch (err) {
        reject(err);
      }
    };
    void tick();
  });
}

test('AC3: noop job completes via the real SmokeConsumer', async (t) => {
  if (!REDIS_URL) {
    t.skip('REDIS_URL not set — live-Redis smoke test skipped');
    return;
  }
  let app, smoke;
  try {
    ({ app, smoke } = await loadWorkerApp());
  } catch (err) {
    // The dist/ build may not be present in scaffold-only runs. Treat the
    // missing build as a skip — not a silent pass via missing dep.
    if (/Cannot find module/i.test(String(err))) {
      t.skip('apps/api dist build not present — run `pnpm --filter @fcm/api build` first');
      return;
    }
    throw err;
  }
  try {
    const enqueued = await smoke.add('noop', { echo: `hello-${randomUUID().slice(0, 6)}` });
    const completed = await waitForJobState(smoke, enqueued.id, 'completed', TIMEOUT_MS);
    const result = completed.returnvalue;
    assert.equal(result.ok, true, 'noop must succeed (AC3)');
    assert.ok(typeof result.echo === 'string', 'noop returns the echo field');
  } finally {
    await smoke.obliterate({ force: true }).catch(() => undefined);
    await app.close();
  }
});

test('AC3: failing job lands in __smoke.dlq AFTER exhausting all retries', async (t) => {
  if (!REDIS_URL) {
    t.skip('REDIS_URL not set — live-Redis smoke test skipped');
    return;
  }
  let app, smoke, dlq;
  try {
    ({ app, smoke, dlq } = await loadWorkerApp());
  } catch (err) {
    if (/Cannot find module/i.test(String(err))) {
      t.skip('apps/api dist build not present — run `pnpm --filter @fcm/api build` first');
      return;
    }
    throw err;
  }
  try {
    const enqueued = await smoke.add('fail', { reason: `smoke-${randomUUID().slice(0, 6)}` });
    const dlqEntry = await waitForDlqEntry(dlq, enqueued.id, TIMEOUT_MS);
    assert.ok(dlqEntry, 'DLQ entry must exist (AC3)');
    // Confirm the entry carries the retry-exhaustion metadata — proves
    // BullMQ retried, did not skip-and-promote on attempt 1.
    const payload = dlqEntry.data;
    assert.equal(payload.originalJobId, enqueued.id, 'DLQ payload must reference the original job id');
    assert.equal(payload.originalQueue, '__smoke', 'DLQ payload must reference the originating queue');
    assert.equal(
      payload.attemptsMade,
      3,
      `DLQ promotion must happen AFTER all 3 attempts — got ${payload.attemptsMade}`,
    );
  } finally {
    await smoke.obliterate({ force: true }).catch(() => undefined);
    await dlq.obliterate({ force: true }).catch(() => undefined);
    await app.close();
  }
});
