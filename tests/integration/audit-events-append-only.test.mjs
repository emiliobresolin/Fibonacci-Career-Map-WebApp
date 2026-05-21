// Story 3-1 AC4: integration test that asserts UPDATE and DELETE against
// audit_events fail. Runs against a live Postgres when DATABASE_URL is set
// (typical CI setup); reported as SKIPPED in local scaffold runs where no
// PG exists yet.
//
// The test exercises the trigger path (defense-in-depth layer 2) — it fires
// for any connecting role, so we don't need to provision a separate
// `fcm_app` role to assert AC4. The role-level REVOKE is exercised
// separately by ops-runbook smoke tests when fcm_app is provisioned (the
// migration's NOTICE output confirms which layer is active).
//
// All work happens inside BEGIN/ROLLBACK so the append-only seed rows do
// not accumulate across test runs — a transaction rollback successfully
// undoes the INSERT even though the trigger forbids DELETE, because the
// trigger fires on DML, not on transaction-level undo.

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

test('AC4: audit_events rejects UPDATE attempts', async (t) => {
  if (!DATABASE_URL) {
    t.skip('DATABASE_URL not set — live-PG integration test skipped');
    return;
  }
  const pg = await loadPgClient();
  if (!pg) {
    // `pg` becomes a project dep when Story 3-3 (outbox relay) lands and
    // needs LISTEN/NOTIFY. Until then the test is reported as SKIPPED so
    // CI doesn't get a silent green pass.
    t.skip('pg client not installed yet — see Story 3-3 deferred dependency');
    return;
  }
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const id = randomUUID();
    const orgId = randomUUID();
    const occurredAt = new Date('2026-05-15T12:00:00Z');
    // Explicit success assertion on the seed: a regression that broke the
    // INSERT path would otherwise produce a false-positive "rejects with
    // /append-only/" because the trigger's exception message contains the
    // same substring.
    const seedResult = await client.query(
      `INSERT INTO audit_events (id, organization_id, event_type, entity_type, occurred_at)
       VALUES ($1, $2, 'test.seed', 'integration-test', $3)
       RETURNING id`,
      [id, orgId, occurredAt],
    );
    assert.equal(seedResult.rowCount, 1, 'seed INSERT must succeed (AC4 baseline)');

    await assert.rejects(
      () =>
        client.query(`UPDATE audit_events SET reason='tampered' WHERE id=$1 AND occurred_at=$2`, [
          id,
          occurredAt,
        ]),
      /append-only|permission denied/i,
      'UPDATE on audit_events must be rejected by the trigger (AC4)',
    );
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
});

test('AC4: audit_events rejects DELETE attempts', async (t) => {
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
    await client.query('BEGIN');
    const id = randomUUID();
    const orgId = randomUUID();
    const occurredAt = new Date('2026-05-16T12:00:00Z');
    const seedResult = await client.query(
      `INSERT INTO audit_events (id, organization_id, event_type, entity_type, occurred_at)
       VALUES ($1, $2, 'test.seed', 'integration-test', $3)
       RETURNING id`,
      [id, orgId, occurredAt],
    );
    assert.equal(seedResult.rowCount, 1, 'seed INSERT must succeed (AC4 baseline)');

    await assert.rejects(
      () =>
        client.query(`DELETE FROM audit_events WHERE id=$1 AND occurred_at=$2`, [id, occurredAt]),
      /append-only|permission denied/i,
      'DELETE on audit_events must be rejected by the trigger (AC4)',
    );
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
});

test('AC4 defense-in-depth: TRUNCATE attempts are rejected', async (t) => {
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
    await client.query('BEGIN');
    await assert.rejects(
      () => client.query('TRUNCATE audit_events'),
      /append-only|permission denied/i,
      'TRUNCATE on audit_events must be rejected by the trigger (defense-in-depth)',
    );
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
});
