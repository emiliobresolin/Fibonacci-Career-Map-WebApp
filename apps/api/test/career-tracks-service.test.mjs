// Story 7-1 — CareerTracksService: validation, soft-deactivation,
// and per-mutation audit emission.
//
// AC coverage:
//   AC1 — ADMIN-only on writes is asserted at the controller layer
//         (career-tracks-controller-wiring.test.mjs); this file
//         exercises the service contract directly.
//   AC2 — soft-deactivation: deactivate() sets active=false; never
//         DELETE; idempotent against an already-inactive row.
//   AC3 — every mutation emits one configuration.changed outbox
//         event INSIDE the same transaction that performed the row
//         write. Audit payload validates against the AuditEvent
//         taxonomy.
//   AC4 — slug uniqueness (P2002 → 409) surfaces as ConflictException.
//
// The fake Prisma mirrors $transaction semantics so we can pin that
// the audit emit is co-located with the row write in one tx.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { CareerTracksService } = await import('../dist/configuration/career-tracks.service.js');
const { CareerTracksRepository } = await import('../dist/configuration/career-tracks.repository.js');
const { Prisma } = await import('@prisma/client');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRACK_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ACTOR = {
  user_id: ADMIN_ID,
  organization_id: ORG_ID,
  role: 'ADMIN',
  display_name: 'Admin',
};

function makeFake({ existingRow = null, throwOnCreate = null } = {}) {
  let state = existingRow ? { ...existingRow } : null;
  const calls = { create: [], update: [], findUnique: [], outboxCreate: [], txCount: 0 };
  const tx = {
    careerTrack: {
      create: async (args) => {
        calls.create.push(args);
        if (throwOnCreate) throw throwOnCreate;
        const now = new Date();
        state = {
          id: TRACK_ID,
          organizationId: args.data.organizationId,
          slug: args.data.slug,
          name: args.data.name,
          description: args.data.description ?? null,
          displayOrder: args.data.displayOrder ?? 0,
          active: args.data.active ?? true,
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
    },
    outboxEvent: {
      create: async (args) => {
        calls.outboxCreate.push(args);
        return args.data;
      },
    },
    $executeRaw: async () => 0,
  };
  const prisma = {
    $transaction: async (fn) => {
      calls.txCount += 1;
      return await fn(tx);
    },
  };
  // The repository constructor takes Prisma; the service constructor
  // takes Prisma + repo. We pass the same fake to both.
  const repo = new CareerTracksRepository(prisma);
  return { prisma, repo, calls };
}

// ── AC3: create() emits configuration.changed in same tx ────────────

test('AC3: create() emits configuration.changed outbox event in same tx', async () => {
  const { prisma, repo, calls } = makeFake();
  const svc = new CareerTracksService(prisma, repo);
  const row = await svc.create(
    ORG_ID,
    { slug: 'product-management', name: 'Product Management', description: 'PM track' },
    ACTOR,
  );

  assert.equal(row.slug, 'product-management');
  assert.equal(calls.create.length, 1);
  assert.equal(calls.outboxCreate.length, 1, 'AC3: one audit event per create');
  assert.equal(calls.txCount, 1, 'AC3: write + audit emit must be in one transaction');

  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'configuration.changed');
  assert.equal(outbox.aggregateType, 'configuration');
  assert.equal(outbox.aggregateId, TRACK_ID);
  assert.equal(outbox.payload.actorId, ADMIN_ID);
  assert.equal(outbox.payload.before.beforeValue, null, 'CREATE has null beforeValue');
  assert.equal(outbox.payload.before.configEntityType, 'career_track');
  assert.equal(outbox.payload.before.field, '*');
  assert.ok(outbox.payload.after.afterValue, 'CREATE has full row in afterValue');
  assert.equal(outbox.payload.after.afterValue.slug, 'product-management');
});

test('AC3: create() outbox payload validates against AuditEvent taxonomy', async () => {
  const { prisma, repo, calls } = makeFake();
  const svc = new CareerTracksService(prisma, repo);
  await svc.create(ORG_ID, { slug: 'pm', name: 'Product' }, ACTOR);
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

// ── AC3: update() emits with before/after row snapshots ─────────────

test('AC3: update() emits configuration.changed with before/after row state', async () => {
  const existing = {
    id: TRACK_ID,
    organizationId: ORG_ID,
    slug: 'eng',
    name: 'Engineering',
    description: null,
    displayOrder: 0,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const { prisma, repo, calls } = makeFake({ existingRow: existing });
  const svc = new CareerTracksService(prisma, repo);
  await svc.update(ORG_ID, TRACK_ID, { name: 'Software Engineering' }, ACTOR);

  assert.equal(calls.update.length, 1);
  assert.equal(calls.outboxCreate.length, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.payload.before.beforeValue.name, 'Engineering');
  assert.equal(outbox.payload.after.afterValue.name, 'Software Engineering');
});

test('update() with empty patch is a no-op (no audit emit, no DB write)', async () => {
  // Form-state sync sends {} occasionally; rejecting that is unhelpful.
  // But it must NOT emit an audit row.
  const existing = {
    id: TRACK_ID,
    organizationId: ORG_ID,
    slug: 'eng',
    name: 'Engineering',
    description: null,
    displayOrder: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, calls } = makeFake({ existingRow: existing });
  const svc = new CareerTracksService(prisma, repo);
  const result = await svc.update(ORG_ID, TRACK_ID, {}, ACTOR);
  assert.equal(result.id, TRACK_ID);
  assert.equal(calls.update.length, 0, 'empty patch must not write');
  assert.equal(calls.outboxCreate.length, 0, 'empty patch must not emit audit');
});

// ── AC2: deactivate is soft + idempotent ────────────────────────────

test('AC2: deactivate() sets active=false and emits one audit event', async () => {
  const existing = {
    id: TRACK_ID,
    organizationId: ORG_ID,
    slug: 'eng',
    name: 'Engineering',
    description: null,
    displayOrder: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, calls } = makeFake({ existingRow: existing });
  const svc = new CareerTracksService(prisma, repo);
  const result = await svc.deactivate(ORG_ID, TRACK_ID, ACTOR);
  assert.equal(result.active, false, 'AC2: soft-delete via active flag');
  assert.equal(calls.update.length, 1);
  assert.equal(calls.outboxCreate.length, 1);
  // Pin: the data passed to update() flips active only, never deletes.
  assert.deepEqual(calls.update[0].data, { active: false });
});

test('AC2: deactivate() on already-inactive track is a no-op (no audit emit)', async () => {
  const existing = {
    id: TRACK_ID,
    organizationId: ORG_ID,
    slug: 'eng',
    name: 'Engineering',
    description: null,
    displayOrder: 0,
    active: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, calls } = makeFake({ existingRow: existing });
  const svc = new CareerTracksService(prisma, repo);
  await svc.deactivate(ORG_ID, TRACK_ID, ACTOR);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.outboxCreate.length, 0, 'idempotent: no duplicate audit on no-op');
});

// ── AC4: slug uniqueness ────────────────────────────────────────────

test('AC4: P2002 on slug collision surfaces as 409 Conflict', async () => {
  const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['slug'] },
  });
  const { prisma, repo } = makeFake({ throwOnCreate: p2002 });
  const svc = new CareerTracksService(prisma, repo);
  let threw = false;
  try {
    await svc.create(ORG_ID, { slug: 'eng', name: 'Engineering' }, ACTOR);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
    assert.match(err.message ?? '', /already exists/i);
  }
  assert.ok(threw, 'slug collision must surface as 409');
});

// ── Validation ──────────────────────────────────────────────────────

test('validates slug shape', async () => {
  const { prisma, repo } = makeFake();
  const svc = new CareerTracksService(prisma, repo);
  for (const bad of ['Eng', '-eng', 'eng-', '!eng', '', 'a']) {
    let threw = false;
    try {
      await svc.create(ORG_ID, { slug: bad, name: 'Engineering' }, ACTOR);
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400, `bad slug "${bad}" should be 400`);
    }
    assert.ok(threw, `expected rejection for slug "${bad}"`);
  }
});

test('validates name (required, bounded)', async () => {
  const { prisma, repo } = makeFake();
  const svc = new CareerTracksService(prisma, repo);
  let threwEmpty = false;
  try {
    await svc.create(ORG_ID, { slug: 'eng', name: '   ' }, ACTOR);
  } catch (err) {
    threwEmpty = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threwEmpty);
  let threwLong = false;
  try {
    await svc.create(ORG_ID, { slug: 'eng', name: 'x'.repeat(201) }, ACTOR);
  } catch (err) {
    threwLong = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threwLong);
});

test('list() filters inactive rows by default; includeInactive returns all', async () => {
  // Service decorates the repo's list result by filtering on `active`.
  const rows = [
    { id: 'a', organizationId: ORG_ID, slug: 'eng', name: 'Eng', description: null, displayOrder: 0, active: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 'b', organizationId: ORG_ID, slug: 'old', name: 'Old', description: null, displayOrder: 1, active: false, createdAt: new Date(), updatedAt: new Date() },
  ];
  const repo = {
    list: async () => rows,
  };
  const svc = new CareerTracksService({}, repo);
  const active = await svc.list(ORG_ID);
  assert.equal(active.length, 1);
  assert.equal(active[0].slug, 'eng');
  const all = await svc.list(ORG_ID, { includeInactive: true });
  assert.equal(all.length, 2);
});

test('findById throws 404 when not found', async () => {
  const repo = { findById: async () => null };
  const svc = new CareerTracksService({}, repo);
  let threw = false;
  try {
    await svc.findById(ORG_ID, TRACK_ID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw);
});
