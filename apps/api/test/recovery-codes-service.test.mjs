// Story 6-4 AC3: RecoveryCodesService.provisionBatch emits one
// `recovery_codes.provisioned` outbox event for the batch (org-scope,
// no single row entityId). The codes themselves are never logged,
// audited, or returned to the relay — only the count.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { RecoveryCodesService } = await import('../dist/auth/recovery-codes.service.js');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeFakePrisma() {
  const calls = {
    createMany: [],
    outboxCreate: [],
    setRls: [],
    txCount: 0,
  };
  const tx = {
    recoveryCode: {
      createMany: async (args) => {
        calls.createMany.push(args);
        return { count: args.data.length };
      },
    },
    outboxEvent: {
      create: async (args) => {
        calls.outboxCreate.push(args);
        return args.data;
      },
    },
    $executeRaw: async (...args) => {
      calls.setRls.push(args);
      return 0;
    },
  };
  const prisma = {
    $transaction: async (fn) => {
      calls.txCount += 1;
      return await fn(tx);
    },
  };
  return { prisma, calls };
}

test('AC3: provisionBatch returns 10 plaintext codes (PRD FR-1.2)', async () => {
  const { prisma } = makeFakePrisma();
  const svc = new RecoveryCodesService(prisma);
  const codes = await svc.provisionBatch(ORG_ID);
  assert.equal(codes.length, 10, 'PRD FR-1.2: 10-code batch');
  for (const code of codes) {
    // Format: xxxx-xxxx-xxxx-xxxx (16 hex chars in 4 groups). Pinned
    // here so a regression that reduces entropy would trip.
    assert.match(code, /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/);
  }
});

test('AC3: provisionBatch emits exactly one outbox event in the same tx', async () => {
  const { prisma, calls } = makeFakePrisma();
  const svc = new RecoveryCodesService(prisma);
  await svc.provisionBatch(ORG_ID);

  assert.equal(calls.txCount, 1, 'createMany + outbox commit in single transaction');
  assert.equal(calls.createMany.length, 1);
  assert.equal(calls.createMany[0].data.length, 10);
  assert.equal(calls.outboxCreate.length, 1, 'exactly one event for the batch — not 10');

  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'recovery_codes.provisioned');
  assert.equal(outbox.aggregateType, 'recovery_code');
  assert.equal(outbox.organizationId, ORG_ID);
  assert.equal(outbox.payload.after.count, 10);
  // Sensitive content guard: nothing in the payload may resemble a code.
  const payloadStr = JSON.stringify(outbox.payload);
  assert.ok(
    !/[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}/.test(payloadStr),
    'plaintext codes must NEVER appear in the outbox payload',
  );
});

test('AC3: outbox payload validates against the AuditEvent taxonomy', async () => {
  const { prisma, calls } = makeFakePrisma();
  const svc = new RecoveryCodesService(prisma);
  await svc.provisionBatch(ORG_ID);
  const outbox = calls.outboxCreate[0].data;
  // The producer sets payload.entityId = null to flip the relay's
  // structural entityId override to null (org-scope event, no single
  // row id). Reconstruct the relay-merged candidate to prove the
  // override works through the spread order.
  const candidate = {
    eventId: outbox.eventId,
    occurredAt: new Date().toISOString(),
    actorId: null,
    organizationId: outbox.organizationId,
    entityType: outbox.aggregateType,
    entityId: outbox.aggregateId, // structural default
    eventType: outbox.eventType,
    ...outbox.payload, // payload.entityId = null overrides
  };
  assert.equal(candidate.entityId, null, 'payload.entityId override must win at relay merge');
  const parsed = safeParseAuditEvent(candidate);
  assert.equal(parsed.ok, true, `relay would reject: ${JSON.stringify(parsed)}`);
  if (parsed.ok) {
    assert.equal(parsed.event.eventType, 'recovery_codes.provisioned');
    assert.equal(parsed.event.entityId, null, 'org-scope event has null entityId');
    assert.equal(parsed.event.after.count, 10);
  }
});
