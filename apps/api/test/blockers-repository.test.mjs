// Story 6-2b: BlockersRepository.
//
// We pin three behaviors:
//   1. Every method wraps withOrgScope (RLS-gated).
//   2. open() emits ONE outbox row tagged blocker.opened AND the
//      payload validates against the AuditEvent taxonomy (so the
//      relay accepts it — no DLQ).
//   3. resolve() does a conditional update via updateMany WHERE id=$1
//      AND resolved_at IS NULL; on zero rows matched throws
//      BlockerAlreadyResolvedError (defends against double-resolve
//      race under concurrency).
//   4. hasActiveBlocker() returns boolean — never the row id (so a
//      visibility-sensitive surface can't leak it).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BlockersRepository, BlockerAlreadyResolvedError } = await import(
  '../dist/identity/blockers.repository.js'
);
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG = '11111111-1111-4111-8111-111111111111';
const EMP = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const BLOCKER = '44444444-4444-4444-8444-444444444444';

function makeCapturingPrisma({
  blockerOnFind = null,
  updateManyCount = 1,
  throwOnCreate = null,
} = {}) {
  const calls = { scopes: [], outboxCreate: [], updateMany: [], creates: [] };
  const tx = {
    $executeRaw: async (_strings, ...params) => {
      calls.scopes.push({ params });
      return 1;
    },
    employeeBlocker: {
      findFirst: async () => blockerOnFind,
      findUnique: async () =>
        blockerOnFind ?? {
          id: BLOCKER,
          organizationId: ORG,
          employeeId: EMP,
          kind: 'PIP',
          reason: 'Active PIP — see HR ticket TKT-12345',
          openedAt: new Date(),
          resolvedAt: new Date(),
          openedBy: ACTOR,
          resolvedBy: ACTOR,
          resolutionNote: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      findMany: async () => [],
      create: async (args) => {
        calls.creates.push(args);
        if (throwOnCreate) throw throwOnCreate;
        return {
          id: BLOCKER,
          organizationId: args.data.organizationId,
          employeeId: args.data.employeeId,
          kind: args.data.kind,
          reason: args.data.reason,
          openedAt: new Date('2026-05-22T10:00:00.000Z'),
          resolvedAt: null,
          openedBy: args.data.openedBy,
          resolvedBy: null,
          resolutionNote: null,
          createdAt: new Date('2026-05-22T10:00:00.000Z'),
          updatedAt: new Date('2026-05-22T10:00:00.000Z'),
        };
      },
      updateMany: async (args) => {
        calls.updateMany.push(args);
        return { count: updateManyCount };
      },
    },
    outboxEvent: {
      create: async (args) => {
        calls.outboxCreate.push(args);
        return args.data;
      },
    },
  };
  const prisma = { $transaction: async (fn) => fn(tx) };
  return { prisma, calls };
}

// ── withOrgScope on every method ───────────────────────────────────

test('findById runs inside withOrgScope', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new BlockersRepository(prisma);
  await repo.findById(ORG, BLOCKER);
  assert.equal(calls.scopes.length, 1);
  assert.ok(calls.scopes[0].params.includes(ORG));
});

test('hasActiveBlocker runs inside withOrgScope', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new BlockersRepository(prisma);
  await repo.hasActiveBlocker(ORG, EMP);
  assert.equal(calls.scopes.length, 1);
});

test('hasActiveBlocker returns boolean, never the row', async () => {
  // Pin the contract that the eligibility evaluator gets a bool —
  // a future regression that returned the row would let a visibility-
  // sensitive surface accidentally leak the blocker's reason.
  const { prisma: p1 } = makeCapturingPrisma({ blockerOnFind: null });
  const { prisma: p2 } = makeCapturingPrisma({ blockerOnFind: { id: 'x' } });
  const repo1 = new BlockersRepository(p1);
  const repo2 = new BlockersRepository(p2);
  assert.equal(await repo1.hasActiveBlocker(ORG, EMP), false);
  assert.equal(await repo2.hasActiveBlocker(ORG, EMP), true);
});

// ── open() emits outbox blocker.opened with valid taxonomy payload ─

test('open() creates the row and emits ONE blocker.opened outbox row in the same transaction', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new BlockersRepository(prisma);
  await repo.open(ORG, {
    employeeId: EMP,
    kind: 'PIP',
    reason: 'Active PIP — see HR ticket TKT-12345 for details',
    openedBy: ACTOR,
  });
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.outboxCreate.length, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'blocker.opened');
  assert.equal(outbox.aggregateType, 'employee_blocker');
  assert.equal(outbox.aggregateId, BLOCKER);
});

test("open() payload validates against AuditEvent taxonomy (relay would accept it)", async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new BlockersRepository(prisma);
  await repo.open(ORG, {
    employeeId: EMP,
    kind: 'PERFORMANCE_CONCERN',
    reason: 'Repeated missed sprint commitments across Q2 cycle',
    openedBy: ACTOR,
  });
  const outbox = calls.outboxCreate[0].data;
  // Reconstruct the candidate the relay (outbox-relay.consumer.ts)
  // would build by merging the outbox row's structural fields with
  // the payload.
  const candidate = {
    eventId: outbox.eventId,
    occurredAt: new Date().toISOString(),
    actorId: null,
    organizationId: outbox.organizationId,
    entityType: outbox.aggregateType,
    entityId: outbox.aggregateId,
    eventType: outbox.eventType,
    ...outbox.payload,
  };
  const parsed = safeParseAuditEvent(candidate);
  assert.equal(parsed.ok, true, `relay would reject: ${JSON.stringify(parsed)}`);
  if (parsed.ok) {
    assert.equal(parsed.event.eventType, 'blocker.opened');
    assert.equal(parsed.event.actorId, ACTOR);
    assert.equal(parsed.event.after.kind, 'PERFORMANCE_CONCERN');
  }
});

// ── resolve() uses conditional update + emits blocker.resolved ─────

test('resolve() uses updateMany WHERE id AND resolved_at IS NULL (double-resolve race guard)', async () => {
  const { prisma, calls } = makeCapturingPrisma({ updateManyCount: 1 });
  const repo = new BlockersRepository(prisma);
  await repo.resolve(ORG, BLOCKER, { resolvedBy: ACTOR, resolutionNote: 'HR concluded successfully' });
  assert.equal(calls.updateMany.length, 1);
  const where = calls.updateMany[0].where;
  assert.equal(where.id, BLOCKER);
  assert.equal(where.resolvedAt, null, 'must condition on resolved_at IS NULL');
});

test('resolve() throws BlockerAlreadyResolvedError when zero rows match (concurrent resolve)', async () => {
  const { prisma } = makeCapturingPrisma({ updateManyCount: 0 });
  const repo = new BlockersRepository(prisma);
  await assert.rejects(
    () => repo.resolve(ORG, BLOCKER, { resolvedBy: ACTOR }),
    BlockerAlreadyResolvedError,
  );
});

test('resolve() emits blocker.resolved outbox with validated taxonomy payload', async () => {
  const { prisma, calls } = makeCapturingPrisma({ updateManyCount: 1 });
  const repo = new BlockersRepository(prisma);
  await repo.resolve(ORG, BLOCKER, { resolvedBy: ACTOR, resolutionNote: 'HR concluded successfully' });
  assert.equal(calls.outboxCreate.length, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'blocker.resolved');
  const candidate = {
    eventId: outbox.eventId,
    occurredAt: new Date().toISOString(),
    actorId: null,
    organizationId: outbox.organizationId,
    entityType: outbox.aggregateType,
    entityId: outbox.aggregateId,
    eventType: outbox.eventType,
    ...outbox.payload,
  };
  const parsed = safeParseAuditEvent(candidate);
  assert.equal(parsed.ok, true, `relay would reject: ${JSON.stringify(parsed)}`);
});
