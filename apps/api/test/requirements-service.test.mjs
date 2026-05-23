// Story 7-4 — RequirementsService: validation, audit emission, soft
// deactivation (AC4 — no hard delete).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { RequirementsService } = await import('../dist/configuration/requirements.service.js');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LAYER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REQ_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ACTOR = { user_id: ADMIN_ID, organization_id: ORG_ID, role: 'ADMIN', display_name: 'Admin' };

function makeFake({ existing = null, layerExists = true } = {}) {
  let state = existing ? { ...existing } : null;
  const calls = { create: [], update: [], findUnique: [], outboxCreate: [], txCount: 0 };
  const tx = {
    requirement: {
      create: async (args) => {
        calls.create.push(args);
        const now = new Date();
        state = {
          id: REQ_ID,
          organizationId: args.data.organizationId,
          layerId: args.data.layerId,
          name: args.data.name,
          description: args.data.description ?? null,
          evidenceType: args.data.evidenceType,
          weight: args.data.weight,
          mandatory: args.data.mandatory ?? false,
          expiryMonths: args.data.expiryMonths ?? null,
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
    outboxEvent: { create: async (args) => { calls.outboxCreate.push(args); return args.data; } },
    $executeRaw: async () => 0,
    $queryRaw: async () => [],  // Story 7-9: resolveAffectedEmployeeIds returns [] in unit tests.
  };
  const prisma = { $transaction: async (fn) => { calls.txCount += 1; return await fn(tx); } };
  const repo = { listByLayer: async () => (state ? [state] : []), findById: async () => state };
  const layersRepo = { findById: async () => (layerExists ? { id: LAYER_ID, organizationId: ORG_ID, levelId: 'x' } : null) };
  return { prisma, repo, layersRepo, calls };
}

const VALID = { name: 'PR reviews completed', evidenceType: 'TEXT', weight: 3, mandatory: true };

// ── AC1: 404 on unknown layer ───────────────────────────────────────
test('AC1: create() under unknown layerId throws 404', async () => {
  const { prisma, repo, layersRepo } = makeFake({ layerExists: false });
  const svc = new RequirementsService(prisma, repo, layersRepo);
  let threw = false;
  try { await svc.create(ORG_ID, LAYER_ID, VALID, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
  assert.ok(threw);
});

test('AC1: list() under unknown layerId throws 404', async () => {
  const { prisma, repo, layersRepo } = makeFake({ layerExists: false });
  const svc = new RequirementsService(prisma, repo, layersRepo);
  let threw = false;
  try { await svc.listByLayer(ORG_ID, LAYER_ID); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
  assert.ok(threw);
});

// ── AC2: field validation ───────────────────────────────────────────
test('AC2: evidenceType must be one of FILE|URL|TEXT|STRUCTURED', async () => {
  const { prisma, repo, layersRepo } = makeFake();
  const svc = new RequirementsService(prisma, repo, layersRepo);
  for (const bad of ['JPG', 'file', '', null, undefined, 123]) {
    let threw = false;
    try { await svc.create(ORG_ID, LAYER_ID, { ...VALID, evidenceType: bad }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
    assert.ok(threw, `expected rejection for evidenceType "${String(bad)}"`);
  }
});

test('AC2: evidenceType accepts each of the four enum values', async () => {
  for (const ok of ['FILE', 'URL', 'TEXT', 'STRUCTURED']) {
    const { prisma, repo, layersRepo, calls } = makeFake();
    const svc = new RequirementsService(prisma, repo, layersRepo);
    await svc.create(ORG_ID, LAYER_ID, { ...VALID, evidenceType: ok }, ACTOR);
    assert.equal(calls.create[0].data.evidenceType, ok);
  }
});

test('AC2: evidenceType validation mirrors the Prisma-generated EvidenceType enum (drift detector)', async () => {
  // Reviewer HIGH #1: if schema.prisma adds a 5th EvidenceType variant,
  // the runtime-derived list must accept it without a code change.
  const { EvidenceType } = await import('@prisma/client');
  const fromPrisma = Object.values(EvidenceType).sort();
  const documented = ['FILE', 'URL', 'TEXT', 'STRUCTURED'].sort();
  // If this assert fails, the schema added a variant and the test
  // (not the service) needs updating — the service derives from the
  // enum at runtime.
  assert.deepEqual(
    fromPrisma,
    documented,
    'EvidenceType enum drifted from documented list; update test, service auto-tracks',
  );
});

test('AC2: weight must be a positive integer', async () => {
  const { prisma, repo, layersRepo } = makeFake();
  const svc = new RequirementsService(prisma, repo, layersRepo);
  for (const bad of [0, -1, 1.5, 1001, 'three', null]) {
    let threw = false;
    try { await svc.create(ORG_ID, LAYER_ID, { ...VALID, weight: bad }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
    assert.ok(threw, `expected rejection for weight ${String(bad)}`);
  }
});

test('AC2: expiryMonths is null OR positive integer', async () => {
  const { prisma, repo, layersRepo } = makeFake();
  const svc = new RequirementsService(prisma, repo, layersRepo);
  // null is fine
  await svc.create(ORG_ID, LAYER_ID, { ...VALID, expiryMonths: null }, ACTOR);
  // positive is fine
  await svc.create(ORG_ID, LAYER_ID, { ...VALID, expiryMonths: 12 }, ACTOR);
  // bad values
  for (const bad of [0, -1, 1.5, 601]) {
    let threw = false;
    try { await svc.create(ORG_ID, LAYER_ID, { ...VALID, expiryMonths: bad }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
    assert.ok(threw, `expected rejection for expiryMonths ${String(bad)}`);
  }
});

test('AC2: mandatory is a boolean (defaults false)', async () => {
  const { prisma, repo, layersRepo, calls } = makeFake();
  const svc = new RequirementsService(prisma, repo, layersRepo);
  await svc.create(ORG_ID, LAYER_ID, { name: VALID.name, evidenceType: 'TEXT', weight: 1 }, ACTOR);
  assert.equal(calls.create[0].data.mandatory, false);
  let threw = false;
  try { await svc.create(ORG_ID, LAYER_ID, { ...VALID, mandatory: 'yes' }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
  assert.ok(threw);
});

test('AC2: name required and bounded; description bounded', async () => {
  const { prisma, repo, layersRepo } = makeFake();
  const svc = new RequirementsService(prisma, repo, layersRepo);
  for (const badName of ['', '   ', 'x'.repeat(201)]) {
    let threw = false;
    try { await svc.create(ORG_ID, LAYER_ID, { ...VALID, name: badName }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
    assert.ok(threw);
  }
  let threwLongDesc = false;
  try { await svc.create(ORG_ID, LAYER_ID, { ...VALID, description: 'd'.repeat(2001) }, ACTOR); } catch (err) { threwLongDesc = true; assert.equal(err.getStatus(), 400); }
  assert.ok(threwLongDesc);
});

// ── AC3: audit emission ─────────────────────────────────────────────
test('AC3: create() emits one configuration.changed outbox event in same tx', async () => {
  const { prisma, repo, layersRepo, calls } = makeFake();
  const svc = new RequirementsService(prisma, repo, layersRepo);
  await svc.create(ORG_ID, LAYER_ID, VALID, ACTOR);
  assert.equal(calls.create.length, 1);
  assert.equal(calls.outboxCreate.length, 1);
  assert.equal(calls.txCount, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'configuration.changed');
  assert.equal(outbox.payload.before.configEntityType, 'requirement');
  assert.equal(outbox.payload.after.afterValue.evidenceType, 'TEXT');
  assert.equal(outbox.payload.after.afterValue.weight, 3);
  assert.equal(outbox.payload.after.afterValue.mandatory, true);
});

test('AC3: audit payload validates against AuditEvent taxonomy', async () => {
  const { prisma, repo, layersRepo, calls } = makeFake();
  const svc = new RequirementsService(prisma, repo, layersRepo);
  await svc.create(ORG_ID, LAYER_ID, VALID, ACTOR);
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

test('update() with empty patch is a no-op', async () => {
  const existing = {
    id: REQ_ID, organizationId: ORG_ID, layerId: LAYER_ID,
    name: 'X', description: null, evidenceType: 'TEXT', weight: 1, mandatory: false, expiryMonths: null,
    active: true, createdAt: new Date(), updatedAt: new Date(),
  };
  const { prisma, repo, layersRepo, calls } = makeFake({ existing });
  const svc = new RequirementsService(prisma, repo, layersRepo);
  await svc.update(ORG_ID, REQ_ID, {}, ACTOR);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.outboxCreate.length, 0);
});

test('update() emits with before/after', async () => {
  const existing = {
    id: REQ_ID, organizationId: ORG_ID, layerId: LAYER_ID,
    name: 'X', description: null, evidenceType: 'TEXT', weight: 1, mandatory: false, expiryMonths: null,
    active: true, createdAt: new Date(), updatedAt: new Date(),
  };
  const { prisma, repo, layersRepo, calls } = makeFake({ existing });
  const svc = new RequirementsService(prisma, repo, layersRepo);
  await svc.update(ORG_ID, REQ_ID, { weight: 5, mandatory: true }, ACTOR);
  assert.equal(calls.outboxCreate.length, 1);
  const p = calls.outboxCreate[0].data.payload;
  assert.equal(p.before.beforeValue.weight, 1);
  assert.equal(p.after.afterValue.weight, 5);
  assert.equal(p.after.afterValue.mandatory, true);
  // Reviewer HIGH #2 hardening: UPDATE never re-parents (no layerId in
  // the patch surface). Pin this invariant so a future maintainer
  // who adds re-parenting must also rethink RLS + audit.
  assert.equal(
    p.before.beforeValue.layerId,
    p.after.afterValue.layerId,
    'PATCH must never change layerId — re-parenting is not a 7-4 feature',
  );
});

// ── AC4: soft deactivate, no hard delete ───────────────────────────
test('AC4: deactivate() flips active=false; no DELETE in calls', async () => {
  const existing = {
    id: REQ_ID, organizationId: ORG_ID, layerId: LAYER_ID,
    name: 'X', description: null, evidenceType: 'TEXT', weight: 1, mandatory: false, expiryMonths: null,
    active: true, createdAt: new Date(), updatedAt: new Date(),
  };
  const { prisma, repo, layersRepo, calls } = makeFake({ existing });
  const svc = new RequirementsService(prisma, repo, layersRepo);
  const result = await svc.deactivate(ORG_ID, REQ_ID, ACTOR);
  assert.equal(result.active, false);
  assert.equal(calls.update.length, 1);
  assert.deepEqual(calls.update[0].data, { active: false });
  assert.equal(calls.outboxCreate.length, 1);
});

test('AC4: deactivate() on already-inactive requirement is a no-op (no audit emit)', async () => {
  const existing = {
    id: REQ_ID, organizationId: ORG_ID, layerId: LAYER_ID,
    name: 'X', description: null, evidenceType: 'TEXT', weight: 1, mandatory: false, expiryMonths: null,
    active: false, createdAt: new Date(), updatedAt: new Date(),
  };
  const { prisma, repo, layersRepo, calls } = makeFake({ existing });
  const svc = new RequirementsService(prisma, repo, layersRepo);
  await svc.deactivate(ORG_ID, REQ_ID, ACTOR);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.outboxCreate.length, 0);
});

test('AC4: RequirementsService has NO hard-delete method (TypeScript surface check)', () => {
  // Guards against a future maintainer adding a `delete()` method that
  // would hard-delete and break the evidence FK + audit trail.
  assert.equal(typeof RequirementsService.prototype.delete, 'undefined');
  assert.equal(typeof RequirementsService.prototype.remove, 'undefined');
  assert.equal(typeof RequirementsService.prototype.destroy, 'undefined');
});

// ── list filtering ──────────────────────────────────────────────────
test('list() filters inactive rows by default; includeInactive returns all', async () => {
  const rows = [
    { id: 'a', organizationId: ORG_ID, layerId: LAYER_ID, name: 'A', description: null, evidenceType: 'TEXT', weight: 1, mandatory: false, expiryMonths: null, active: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 'b', organizationId: ORG_ID, layerId: LAYER_ID, name: 'B', description: null, evidenceType: 'TEXT', weight: 1, mandatory: false, expiryMonths: null, active: false, createdAt: new Date(), updatedAt: new Date() },
  ];
  const repo = { listByLayer: async () => rows, findById: async () => null };
  const layersRepo = { findById: async () => ({ id: LAYER_ID }) };
  const svc = new RequirementsService({}, repo, layersRepo);
  const active = await svc.listByLayer(ORG_ID, LAYER_ID);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'a');
  const all = await svc.listByLayer(ORG_ID, LAYER_ID, { includeInactive: true });
  assert.equal(all.length, 2);
});

test('findById throws 404 when not found', async () => {
  const repo = { findById: async () => null };
  const layersRepo = { findById: async () => ({ id: LAYER_ID }) };
  const svc = new RequirementsService({}, repo, layersRepo);
  let threw = false;
  try { await svc.findById(ORG_ID, REQ_ID); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
  assert.ok(threw);
});
