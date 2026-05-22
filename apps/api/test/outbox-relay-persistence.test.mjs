// Regression test for the Epic-2 verification pass blockers on Story 3-3
// (outbox-relay persistence).
//
// The relay's earlier code persisted:
//   • actor_id = NULL  (regardless of payload)
//   • before = NULL    (regardless of variant)
//   • after = <entire payload blob>  (instead of the variant's `after`)
//
// All three broke Story 3-5 (audit-read RBAC: actor_id = $sub never matched)
// and dumped malformed data into the audit_events row.
//
// This test asserts the relay now reads from the Zod-validated event and
// persists each column from the structured field. We exercise the SQL-
// building code by capturing the bound parameters at the $executeRaw call
// site — no live DB needed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { OutboxRelayConsumer } = await import('../dist/outbox/outbox-relay.consumer.js');

const ORG = '11111111-1111-1111-1111-111111111111';
const ACTOR = '22222222-2222-2222-2222-222222222222';
const EVENT = '33333333-3333-3333-3333-333333333333';
const ENTITY = '44444444-4444-4444-4444-444444444444';
const NOW = new Date('2026-05-22T10:00:00Z');

/** Capture every $executeRaw / $queryRaw call so we can inspect the
 *  bound parameters. Prisma's tagged-template helper resolves the
 *  template into a single sql object — we serialize it into a flat
 *  capture shape for assertion. */
function makeCapturingTx() {
  const calls = [];
  const tx = {
    $queryRaw: async (strings, ...params) => {
      calls.push({ kind: 'select', strings, params });
      // First call (SELECT FOR UPDATE) returns the locked outbox row.
      return [
        {
          event_id: EVENT,
          organization_id: ORG,
          aggregate_type: 'session',
          aggregate_id: ENTITY,
          event_type: 'session.revoked',
          payload: {
            actorId: ACTOR,
            reason: 'Admin-initiated forced logout',
            before: { targetUserId: ENTITY, revokedSessionCount: 2 },
            after: null,
          },
          created_at: NOW,
          published_at: null,
        },
      ];
    },
    $executeRaw: async (strings, ...params) => {
      calls.push({ kind: 'mutate', strings, params });
      return 1;
    },
  };
  return { tx, calls };
}

function makePrisma(tx) {
  return {
    $transaction: async (fn) => fn(tx),
  };
}

function makeConsumer(prisma) {
  // Mirror the constructor signature: prisma, dlq, config.
  const dlq = { add: async () => undefined };
  return new OutboxRelayConsumer(prisma, dlq, undefined);
}

test('relay persists actor_id from the validated event payload (was hardcoded NULL)', async () => {
  const { tx, calls } = makeCapturingTx();
  const consumer = makeConsumer(makePrisma(tx));
  await consumer.process({ data: { eventId: EVENT } });
  // The audit INSERT is the second $executeRaw (first is SELECT FOR UPDATE
  // via $queryRaw; the second mutate is the UPDATE on outbox_events).
  const inserts = calls.filter((c) => c.kind === 'mutate');
  const auditInsert = inserts[0];
  assert.ok(auditInsert, 'expected an audit INSERT to be issued');
  // Look at the bound params — the SQL template fragments interleave,
  // and our payload's actorId should appear as one of them.
  assert.ok(
    auditInsert.params.includes(ACTOR),
    `actor_id ${ACTOR} must be bound into the audit INSERT, got params: ${JSON.stringify(auditInsert.params)}`,
  );
});

test('relay persists structured before/after, not the full payload blob (was payload-into-after)', async () => {
  const { tx, calls } = makeCapturingTx();
  const consumer = makeConsumer(makePrisma(tx));
  await consumer.process({ data: { eventId: EVENT } });
  const auditInsert = calls.filter((c) => c.kind === 'mutate')[0];
  // session.revoked variant: before = { targetUserId, revokedSessionCount },
  // after = null.
  const beforeJson = JSON.stringify({ targetUserId: ENTITY, revokedSessionCount: 2 });
  assert.ok(
    auditInsert.params.includes(beforeJson),
    `before JSON ${beforeJson} must be bound; got: ${JSON.stringify(auditInsert.params)}`,
  );
  // `after` is null for this variant; verify null is bound, not the full
  // payload object (which would have actorId/reason/before in it).
  const hasFullPayloadBlob = auditInsert.params.some(
    (p) => typeof p === 'object' && p !== null && 'actorId' in p && 'before' in p,
  );
  assert.equal(
    hasFullPayloadBlob,
    false,
    'audit INSERT must NOT bind the entire payload object into `after`',
  );
});

test('relay persists reason from the validated event (was missing — column always NULL)', async () => {
  const { tx, calls } = makeCapturingTx();
  const consumer = makeConsumer(makePrisma(tx));
  await consumer.process({ data: { eventId: EVENT } });
  const auditInsert = calls.filter((c) => c.kind === 'mutate')[0];
  assert.ok(
    auditInsert.params.includes('Admin-initiated forced logout'),
    'reason must be bound into the audit INSERT',
  );
});
