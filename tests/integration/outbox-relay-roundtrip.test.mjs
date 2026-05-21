// Story 3-3 AC2 + AC3 + AC4: end-to-end outbox-relay test.
//
//   AC2: a row inserted into outbox_events triggers the relay which writes
//        a matching row into audit_events and marks the outbox row
//        published_at = NOW().
//   AC3: idempotency — a duplicate enqueue of the same event_id does not
//        produce a duplicate audit_events row.
//   AC4: fcm_outbox_relay_depth gauge surfaces in the Prometheus snapshot
//        (the actual alert rule lives in EPIC-16).
//
// Boots the actual NestJS worker-mode application context so the test
// exercises OutboxListenerService + OutboxRelayConsumer + OutboxDepthService
// — not hand-rolled BullMQ/PG. Reported as SKIPPED (not silently passed)
// when DATABASE_URL or REDIS_URL is unset, or when the apps/api dist
// build is absent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const TIMEOUT_MS = 15_000;

async function loadWorkerApp() {
  const [{ NestFactory }, { AppModule }] = await Promise.all([
    import('@nestjs/core'),
    import('../../apps/api/dist/app.module.js'),
  ]);
  const appModule = AppModule.register({ mode: 'worker' });
  const app = await NestFactory.createApplicationContext(appModule, { bufferLogs: true });
  await app.init();
  return app;
}

async function loadPg() {
  try {
    const mod = await import('pg');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function waitUntil(predicate, timeoutMs, pollMs = 100) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = async () => {
      try {
        const result = await predicate();
        if (result) {
          resolve(result);
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error('waitUntil: predicate never returned a truthy value'));
          return;
        }
        setTimeout(tick, pollMs);
      } catch (err) {
        reject(err);
      }
    };
    void tick();
  });
}

test('AC2 + AC3: outbox row is relayed to audit_events; duplicate enqueue is idempotent', async (t) => {
  if (!DATABASE_URL || !REDIS_URL) {
    t.skip('DATABASE_URL and REDIS_URL required — integration test skipped');
    return;
  }
  const pg = await loadPg();
  if (!pg) {
    t.skip('pg not installed');
    return;
  }
  let app;
  try {
    app = await loadWorkerApp();
  } catch (err) {
    if (/Cannot find module/i.test(String(err))) {
      t.skip('apps/api dist build not present — run `pnpm --filter @fcm/api build` first');
      return;
    }
    throw err;
  }

  const pgClient = new pg.Client({ connectionString: DATABASE_URL });
  await pgClient.connect();
  const eventId = randomUUID();
  const orgId = randomUUID();
  const aggId = randomUUID();
  try {
    // Trigger: insert an outbox row. The trigger fires pg_notify('outbox_new', event_id)
    // at COMMIT time; the OutboxListenerService receives it and enqueues a
    // relay job onto audit.outbox-relay.
    await pgClient.query(
      `INSERT INTO outbox_events (event_id, organization_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, 'integration-test', $3, 'test.relay.roundtrip', '{"x":1}'::jsonb)`,
      [eventId, orgId, aggId],
    );

    // Wait until the outbox row is published AND the audit row exists.
    await waitUntil(
      async () => {
        const ob = await pgClient.query(
          `SELECT published_at FROM outbox_events WHERE event_id = $1`,
          [eventId],
        );
        const au = await pgClient.query(
          `SELECT id FROM audit_events WHERE id = $1`,
          [eventId],
        );
        return ob.rows[0]?.published_at !== null && au.rowCount === 1;
      },
      TIMEOUT_MS,
    );

    const auditRows = await pgClient.query(
      `SELECT COUNT(*)::int AS n FROM audit_events WHERE id = $1`,
      [eventId],
    );
    assert.equal(auditRows.rows[0].n, 1, 'exactly one audit_events row should exist (AC2)');

    // AC3 idempotency: re-INSERTing the outbox row with the same event_id
    // would fail on the PK, which is the expected outbox semantic
    // (single-shot). Instead we re-enqueue the SAME event_id directly to
    // the BullMQ queue and assert the audit row count stays at 1.
    const { getQueueToken } = await import('@nestjs/bullmq');
    const queue = app.get(getQueueToken('audit.outbox-relay'));
    await queue.add('relay', { eventId }, { jobId: `${eventId}-rerun` });
    // Give the consumer a moment to discover the row is already published.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const auditRowsAfterRerun = await pgClient.query(
      `SELECT COUNT(*)::int AS n FROM audit_events WHERE id = $1`,
      [eventId],
    );
    assert.equal(
      auditRowsAfterRerun.rows[0].n,
      1,
      'duplicate enqueue must NOT produce a second audit row (AC3)',
    );
  } finally {
    // outbox rows are mutable — delete the test row. audit_events is
    // append-only; the test row stays until partition pruning eventually
    // sweeps it. That's fine for an integration test.
    await pgClient.query(`DELETE FROM outbox_events WHERE event_id = $1`, [eventId]).catch(() => undefined);
    await pgClient.end();
    await app.close();
  }
});

test('AC4: fcm_outbox_relay_depth gauge appears in the Prometheus snapshot', async (t) => {
  if (!DATABASE_URL || !REDIS_URL) {
    t.skip('DATABASE_URL and REDIS_URL required — integration test skipped');
    return;
  }
  let app;
  try {
    app = await loadWorkerApp();
  } catch (err) {
    if (/Cannot find module/i.test(String(err))) {
      t.skip('apps/api dist build not present');
      return;
    }
    throw err;
  }
  try {
    const { MetricsService } = await import('../../apps/api/dist/observability/metrics.service.js');
    const metrics = app.get(MetricsService);
    // OutboxDepthService samples on onModuleInit, so by the time app.init()
    // resolved the gauge has at least one observation.
    const { body } = await metrics.snapshot();
    assert.match(body, /fcm_outbox_relay_depth/, 'fcm_outbox_relay_depth gauge must be in the snapshot (AC4)');
  } finally {
    await app.close();
  }
});
