// Story 3-2 AC4: integration test that demonstrates the outbox NOTIFY
// fires on COMMIT and is silently discarded on ROLLBACK. This is the
// atomicity guarantee the outbox pattern relies on (Arch §9.3).
//
// Runs against a live Postgres when DATABASE_URL is set; reported as
// SKIPPED (not silently passed) when DATABASE_URL is unset OR when the
// `pg` client is not yet installed.
//
// Design notes:
//   • Both COMMIT and ROLLBACK halves use explicit BEGIN/COMMIT(or ROLLBACK)
//     for symmetry — the demonstration is at the transaction boundary, not
//     at autocommit boundaries.
//   • The ROLLBACK half uses a SENTINEL: after the ROLLBACK, we commit a
//     second known-good insert and wait for ITS notification. Receiving
//     the sentinel proves the listener is healthy; the assertion that the
//     rolled-back event_id never arrived is then meaningful instead of
//     vacuously true via a broken listener.
//   • Cleanup is keyed on event_id (the random UUID we mint) so parallel
//     test runs / dev environments never collide.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function loadPgClient() {
  try {
    const mod = await import('pg');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
/** Long enough to absorb a slow CI runner + cold Postgres; small enough that
 *  a real regression (no NOTIFY ever fires) fails the suite quickly. */
const NOTIFICATION_TIMEOUT_MS = 5_000;

/** Wait for the first 'outbox_new' notification matching `predicate` or
 *  reject after `timeoutMs`. Event-driven — no polling, no flake under load. */
function waitForNotification(client, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('notification', onNotification);
      reject(new Error(`timed out waiting for outbox_new notification (${timeoutMs}ms)`));
    }, timeoutMs);
    const onNotification = (msg) => {
      if (msg.channel !== 'outbox_new') return;
      if (!predicate(msg.payload)) return;
      clearTimeout(timer);
      client.off('notification', onNotification);
      resolve(msg.payload);
    };
    client.on('notification', onNotification);
  });
}

/** Collect all 'outbox_new' notifications until the listener emits the
 *  sentinel payload. Useful for the ROLLBACK test, which needs to assert
 *  a non-arrival followed by an arrival. */
function collectUntilSentinel(client, sentinelPayload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const received = [];
    const timer = setTimeout(() => {
      client.off('notification', onNotification);
      reject(new Error(`timed out waiting for sentinel notification (${timeoutMs}ms)`));
    }, timeoutMs);
    const onNotification = (msg) => {
      if (msg.channel !== 'outbox_new') return;
      received.push(msg.payload);
      if (msg.payload === sentinelPayload) {
        clearTimeout(timer);
        client.off('notification', onNotification);
        resolve(received);
      }
    };
    client.on('notification', onNotification);
  });
}

test('AC4: pg_notify fires on COMMIT (explicit BEGIN/COMMIT)', async (t) => {
  if (!DATABASE_URL) {
    t.skip('DATABASE_URL not set — live-PG integration test skipped');
    return;
  }
  const pg = await loadPgClient();
  if (!pg) {
    t.skip('pg client not installed yet — see Story 3-3 deferred dependency');
    return;
  }
  const listener = new pg.Client({ connectionString: DATABASE_URL });
  const writer = new pg.Client({ connectionString: DATABASE_URL });
  await Promise.all([listener.connect(), writer.connect()]);
  const eventId = randomUUID();
  try {
    await listener.query('LISTEN outbox_new');
    const arrival = waitForNotification(listener, (p) => p === eventId, NOTIFICATION_TIMEOUT_MS);

    await writer.query('BEGIN');
    await writer.query(
      `INSERT INTO outbox_events (event_id, organization_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, 'integration-test', $3, 'test.commit', '{}'::jsonb)`,
      [eventId, randomUUID(), randomUUID()],
    );
    await writer.query('COMMIT');

    const got = await arrival;
    assert.equal(got, eventId, `listener must receive event_id ${eventId} after COMMIT`);
  } finally {
    await writer.query(`DELETE FROM outbox_events WHERE event_id = $1`, [eventId]).catch(() => undefined);
    await listener.end();
    await writer.end();
  }
});

test('AC4: pg_notify is silent on ROLLBACK (sentinel-anchored)', async (t) => {
  if (!DATABASE_URL) {
    t.skip('DATABASE_URL not set — live-PG integration test skipped');
    return;
  }
  const pg = await loadPgClient();
  if (!pg) {
    t.skip('pg client not installed yet — see Story 3-3 deferred dependency');
    return;
  }
  const listener = new pg.Client({ connectionString: DATABASE_URL });
  const writer = new pg.Client({ connectionString: DATABASE_URL });
  await Promise.all([listener.connect(), writer.connect()]);
  const rolledBackEventId = randomUUID();
  const sentinelEventId = randomUUID();
  try {
    await listener.query('LISTEN outbox_new');
    const collected = collectUntilSentinel(listener, sentinelEventId, NOTIFICATION_TIMEOUT_MS);

    // Phase 1: insert then ROLLBACK — must NOT produce a notification.
    await writer.query('BEGIN');
    await writer.query(
      `INSERT INTO outbox_events (event_id, organization_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, 'integration-test', $3, 'test.rollback', '{}'::jsonb)`,
      [rolledBackEventId, randomUUID(), randomUUID()],
    );
    await writer.query('ROLLBACK');

    // Phase 2: commit a sentinel insert — its notification proves the
    // listener is alive and the channel pipe is healthy. Without this we
    // could vacuously "pass" by silently disconnecting the listener.
    await writer.query('BEGIN');
    await writer.query(
      `INSERT INTO outbox_events (event_id, organization_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, 'integration-test', $3, 'test.sentinel', '{}'::jsonb)`,
      [sentinelEventId, randomUUID(), randomUUID()],
    );
    await writer.query('COMMIT');

    const received = await collected;
    assert.ok(
      received.includes(sentinelEventId),
      'sentinel must arrive — proves listener and trigger are functional',
    );
    assert.ok(
      !received.includes(rolledBackEventId),
      `rolled-back event_id ${rolledBackEventId} must NOT appear — got ${JSON.stringify(received)}`,
    );
  } finally {
    await writer.query(`DELETE FROM outbox_events WHERE event_id = $1`, [sentinelEventId]).catch(() => undefined);
    await listener.end();
    await writer.end();
  }
});

test('AC4 defense-in-depth: the trigger is installed and ENABLE ALWAYS', async (t) => {
  if (!DATABASE_URL) {
    t.skip('DATABASE_URL not set — live-PG integration test skipped');
    return;
  }
  const pg = await loadPgClient();
  if (!pg) {
    t.skip('pg client not installed yet — see Story 3-3 deferred dependency');
    return;
  }
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // tgenabled: 'O' = ENABLE (default), 'A' = ENABLE ALWAYS, 'R' = REPLICA, 'D' = DISABLED.
    const res = await client.query(
      `SELECT tgenabled FROM pg_trigger WHERE tgname = 'outbox_events_notify_trigger'`,
    );
    assert.equal(res.rowCount, 1, 'outbox_events_notify_trigger must exist');
    assert.equal(
      res.rows[0].tgenabled,
      'A',
      'trigger must be ENABLE ALWAYS so session_replication_role=replica cannot bypass it',
    );
  } finally {
    await client.end();
  }
});
