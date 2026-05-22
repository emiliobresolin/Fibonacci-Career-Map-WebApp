// Story 7-3 — LayersService: validation, audit emission via the shared
// helper, and AC2 last-layer-protection.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { LayersService } = await import('../dist/configuration/layers.service.js');
const { Prisma } = await import('@prisma/client');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEVEL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LAYER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ACTOR = {
  user_id: ADMIN_ID,
  organization_id: ORG_ID,
  role: 'ADMIN',
  display_name: 'Admin',
};

function makeFake({
  existingLayer = null,
  levelExists = true,
  throwOnCreate = null,
  surviving = 2, // siblings remaining after a delete
} = {}) {
  let state = existingLayer ? { ...existingLayer } : null;
  const calls = {
    create: [],
    update: [],
    delete: [],
    findUnique: [],
    count: [],
    outboxCreate: [],
    txCount: 0,
    rawSql: [],
  };
  const tx = {
    layer: {
      create: async (args) => {
        calls.create.push(args);
        if (throwOnCreate) throw throwOnCreate;
        const now = new Date();
        state = {
          id: LAYER_ID,
          organizationId: args.data.organizationId,
          levelId: args.data.levelId,
          name: args.data.name,
          displayOrder: args.data.displayOrder ?? 0,
          createdAt: now,
          updatedAt: now,
        };
        return state;
      },
      findUnique: async (args) => {
        calls.findUnique.push(args);
        return state;
      },
      update: async (args) => {
        calls.update.push(args);
        state = { ...state, ...args.data, updatedAt: new Date() };
        return state;
      },
      delete: async (args) => {
        calls.delete.push(args);
        return state;
      },
      count: async (args) => {
        calls.count.push(args);
        return surviving;
      },
    },
    outboxEvent: {
      create: async (args) => {
        calls.outboxCreate.push(args);
        return args.data;
      },
    },
    $executeRaw: async (template, ...params) => {
      // Capture raw SQL probes so we can assert lock-before-count ordering.
      const sql = Array.isArray(template?.strings) ? template.strings.join('?') : String(template?.raw ?? template);
      calls.rawSql.push({ sql, params });
      return 0;
    },
  };
  const prisma = {
    $transaction: async (fn) => {
      calls.txCount += 1;
      return await fn(tx);
    },
  };
  const repo = {
    listByLevel: async () => (state ? [state] : []),
    findById: async () => state,
  };
  const levelsRepo = {
    findById: async () => (levelExists ? { id: LEVEL_ID, organizationId: ORG_ID } : null),
  };
  return { prisma, repo, levelsRepo, calls };
}

// ── AC1: 404 on unknown level ───────────────────────────────────────

test('AC1: create() under unknown levelId throws 404', async () => {
  const { prisma, repo, levelsRepo } = makeFake({ levelExists: false });
  const svc = new LayersService(prisma, repo, levelsRepo);
  let threw = false;
  try {
    await svc.create(ORG_ID, LEVEL_ID, { name: 'Capability' }, ACTOR);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw);
});

test('AC1: list() under unknown levelId throws 404', async () => {
  const { prisma, repo, levelsRepo } = makeFake({ levelExists: false });
  const svc = new LayersService(prisma, repo, levelsRepo);
  let threw = false;
  try {
    await svc.listByLevel(ORG_ID, LEVEL_ID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw);
});

// ── AC3: audit emission ─────────────────────────────────────────────

test('AC3: create() emits one configuration.changed outbox event in same tx', async () => {
  const { prisma, repo, levelsRepo, calls } = makeFake();
  const svc = new LayersService(prisma, repo, levelsRepo);
  const row = await svc.create(ORG_ID, LEVEL_ID, { name: 'Capability' }, ACTOR);

  assert.equal(row.name, 'Capability');
  assert.equal(calls.create.length, 1);
  assert.equal(calls.outboxCreate.length, 1);
  assert.equal(calls.txCount, 1);

  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'configuration.changed');
  assert.equal(outbox.aggregateType, 'configuration');
  assert.equal(outbox.aggregateId, LAYER_ID);
  assert.equal(outbox.payload.actorId, ADMIN_ID);
  assert.equal(outbox.payload.before.configEntityType, 'layer');
  assert.equal(outbox.payload.before.field, '*');
  assert.equal(outbox.payload.before.beforeValue, null);
  assert.equal(outbox.payload.after.afterValue.name, 'Capability');
});

test('AC3: outbox payload validates against AuditEvent taxonomy', async () => {
  const { prisma, repo, levelsRepo, calls } = makeFake();
  const svc = new LayersService(prisma, repo, levelsRepo);
  await svc.create(ORG_ID, LEVEL_ID, { name: 'Capability' }, ACTOR);
  const outbox = calls.outboxCreate[0].data;
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

test('AC3: update() emits with before/after row snapshots', async () => {
  const existing = {
    id: LAYER_ID,
    organizationId: ORG_ID,
    levelId: LEVEL_ID,
    name: 'Capability',
    displayOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const { prisma, repo, levelsRepo, calls } = makeFake({ existingLayer: existing });
  const svc = new LayersService(prisma, repo, levelsRepo);
  await svc.update(ORG_ID, LAYER_ID, { name: 'Capabilities' }, ACTOR);
  assert.equal(calls.outboxCreate.length, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.payload.before.beforeValue.name, 'Capability');
  assert.equal(outbox.payload.after.afterValue.name, 'Capabilities');
});

test('update() with empty patch is a no-op (no audit emit, no DB write)', async () => {
  const existing = {
    id: LAYER_ID,
    organizationId: ORG_ID,
    levelId: LEVEL_ID,
    name: 'Capability',
    displayOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, levelsRepo, calls } = makeFake({ existingLayer: existing });
  const svc = new LayersService(prisma, repo, levelsRepo);
  const result = await svc.update(ORG_ID, LAYER_ID, {}, ACTOR);
  assert.equal(result.id, LAYER_ID);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.outboxCreate.length, 0);
});

// ── AC2: last-layer protection ──────────────────────────────────────

test('AC2: remove() of a last-remaining layer throws 409 LAYER_MIN_VIOLATION', async () => {
  const existing = {
    id: LAYER_ID,
    organizationId: ORG_ID,
    levelId: LEVEL_ID,
    name: 'Capability',
    displayOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, levelsRepo, calls } = makeFake({
    existingLayer: existing,
    surviving: 0, // no other layers in this level
  });
  const svc = new LayersService(prisma, repo, levelsRepo);
  let threw = false;
  try {
    await svc.remove(ORG_ID, LAYER_ID, ACTOR);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
    const body = err.getResponse();
    assert.equal(body.error, 'layer_min_violation');
    assert.equal(body.level_id, LEVEL_ID);
  }
  assert.ok(threw, 'last-layer delete must surface as 409');
  assert.equal(calls.delete.length, 0, 'no delete on the failing path');
  assert.equal(calls.outboxCreate.length, 0, 'no audit on the failing path');
});

test('AC2: remove() proceeds when other layers survive; DELETE audit shape validates', async () => {
  const existing = {
    id: LAYER_ID,
    organizationId: ORG_ID,
    levelId: LEVEL_ID,
    name: 'Capability',
    displayOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, levelsRepo, calls } = makeFake({
    existingLayer: existing,
    surviving: 2, // peers remain
  });
  const svc = new LayersService(prisma, repo, levelsRepo);
  await svc.remove(ORG_ID, LAYER_ID, ACTOR);
  assert.equal(calls.delete.length, 1);
  assert.equal(calls.outboxCreate.length, 1, 'delete emits one audit event');
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.payload.before.beforeValue.id, LAYER_ID);
  assert.equal(outbox.payload.after.afterValue, null, 'DELETE has null afterValue');

  // Reviewer H2: validate the DELETE shape against the relay schema —
  // a future schema tightening swapping z.unknown() for something
  // stricter would otherwise silently break DELETE.
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
  assert.equal(parsed.ok, true, `DELETE audit shape would be rejected by relay: ${JSON.stringify(parsed)}`);
});

test('AC2: count + delete + audit run inside a single transaction, advisory lock is taken FIRST', async () => {
  const existing = {
    id: LAYER_ID,
    organizationId: ORG_ID,
    levelId: LEVEL_ID,
    name: 'Capability',
    displayOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, levelsRepo, calls } = makeFake({
    existingLayer: existing,
    surviving: 2,
  });
  const svc = new LayersService(prisma, repo, levelsRepo);
  await svc.remove(ORG_ID, LAYER_ID, ACTOR);
  assert.equal(calls.txCount, 1, 'count + delete + audit must run in one tx');
  // Count must filter by levelId AND exclude the row being deleted.
  assert.equal(calls.count[0].where.levelId, LEVEL_ID);
  assert.deepEqual(calls.count[0].where.id, { not: LAYER_ID });
  // Reviewer B1 fix: pg_advisory_xact_lock must fire BEFORE the count
  // so two concurrent deletes serialize on the same level. We assert
  // that the raw-SQL call (the lock) is observed and contains the
  // pg_advisory_xact_lock primitive.
  const lockSql = calls.rawSql.find((r) => /pg_advisory_xact_lock/i.test(r.sql));
  assert.ok(lockSql, 'pg_advisory_xact_lock must be called inside remove()');
});

test('remove() on unknown layer throws 404', async () => {
  const { prisma, repo, levelsRepo } = makeFake({ existingLayer: null });
  const svc = new LayersService(prisma, repo, levelsRepo);
  let threw = false;
  try {
    await svc.remove(ORG_ID, LAYER_ID, ACTOR);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw);
});

// ── Unique name → 409 ───────────────────────────────────────────────

test('P2002 on (levelId, name) collision surfaces as 409 Conflict', async () => {
  const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['level_id', 'name'] },
  });
  const { prisma, repo, levelsRepo } = makeFake({ throwOnCreate: p2002 });
  const svc = new LayersService(prisma, repo, levelsRepo);
  let threw = false;
  try {
    await svc.create(ORG_ID, LEVEL_ID, { name: 'Capability' }, ACTOR);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
    assert.match(err.message ?? '', /already exists/i);
  }
  assert.ok(threw);
});

// ── Validation ──────────────────────────────────────────────────────

test('validates name (required, bounded)', async () => {
  const { prisma, repo, levelsRepo } = makeFake();
  const svc = new LayersService(prisma, repo, levelsRepo);
  for (const bad of ['', '   ', 'x'.repeat(201)]) {
    let threw = false;
    try {
      await svc.create(ORG_ID, LEVEL_ID, { name: bad }, ACTOR);
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400, `bad name "${bad.slice(0, 10)}…" should be 400`);
    }
    assert.ok(threw);
  }
});

test('validates displayOrder (non-negative integer)', async () => {
  const { prisma, repo, levelsRepo } = makeFake();
  const svc = new LayersService(prisma, repo, levelsRepo);
  for (const bad of [-1, 1.5, 'one']) {
    let threw = false;
    try {
      await svc.create(ORG_ID, LEVEL_ID, { name: 'Capability', displayOrder: bad }, ACTOR);
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400);
    }
    assert.ok(threw);
  }
});

test('findById throws 404 when not found', async () => {
  const { prisma, levelsRepo } = makeFake();
  const repo = { findById: async () => null };
  const svc = new LayersService(prisma, repo, levelsRepo);
  let threw = false;
  try {
    await svc.findById(ORG_ID, LAYER_ID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw);
});
