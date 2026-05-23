// Story 7-10 — OrgSettingsService promotion-mode (rollout) surface.
// AC1+AC2 (dedicated transitions/snapshots tables) deferred F7-10a.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { OrgSettingsService } = await import('../dist/configuration/org-settings.service.js');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR = { user_id: ADMIN_ID, organization_id: ORG_ID, role: 'ADMIN', display_name: 'Admin' };

function makeFake({ currentMode = 'CALIBRATION', changedAt = null, changedBy = null, orgExists = true } = {}) {
  let state = orgExists ? { promotionMode: currentMode, promotionModeChangedAt: changedAt, promotionModeChangedBy: changedBy } : null;
  const calls = { findUnique: [], update: [], outboxCreate: [], txCount: 0, rawSql: [] };
  const tx = {
    organization: {
      findUnique: async (args) => { calls.findUnique.push(args); return state; },
      update: async (args) => { calls.update.push(args); state = { ...state, ...args.data }; return state; },
    },
    outboxEvent: { create: async (args) => { calls.outboxCreate.push(args); return args.data; } },
    $executeRaw: async (template, ...params) => {
      const sql = Array.isArray(template?.strings) ? template.strings.join('?') : String(template);
      calls.rawSql.push({ sql, params });
      return 0;
    },
  };
  const prisma = { $transaction: async (fn) => { calls.txCount += 1; return await fn(tx); } };
  return { prisma, calls };
}

const LONG_RATIONALE = 'x'.repeat(100); // exactly the minimum

// ── AC3: GET ────────────────────────────────────────────────────────
test('AC3: getPromotionMode returns current mode + last-transition metadata', async () => {
  const ts = new Date('2026-04-01T12:00:00.000Z');
  const { prisma } = makeFake({ currentMode: 'ACTIVE', changedAt: ts, changedBy: ADMIN_ID });
  const svc = new OrgSettingsService(prisma);
  const result = await svc.getPromotionMode(ORG_ID);
  assert.deepEqual(result, {
    promotionMode: 'ACTIVE',
    changedAt: '2026-04-01T12:00:00.000Z',
    changedBy: ADMIN_ID,
  });
});

test('AC3: getPromotionMode returns null metadata for never-transitioned org', async () => {
  const { prisma } = makeFake({ currentMode: 'CALIBRATION' });
  const svc = new OrgSettingsService(prisma);
  const result = await svc.getPromotionMode(ORG_ID);
  assert.deepEqual(result, { promotionMode: 'CALIBRATION', changedAt: null, changedBy: null });
});

test('getPromotionMode throws 404 for unknown org', async () => {
  const { prisma } = makeFake({ orgExists: false });
  const svc = new OrgSettingsService(prisma);
  let threw = false;
  try { await svc.getPromotionMode(ORG_ID); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
  assert.ok(threw);
});

// ── AC4: CALIBRATION → ACTIVE rationale gate ───────────────────────
test('AC4: CALIBRATION → ACTIVE without rationale → 400', async () => {
  const { prisma } = makeFake({ currentMode: 'CALIBRATION' });
  const svc = new OrgSettingsService(prisma);
  for (const bad of [undefined, null, '', '   ', 'too short']) {
    let threw = false;
    try {
      await svc.transitionPromotionMode(ORG_ID, { promotionMode: 'ACTIVE', rationale: bad }, ACTOR);
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400);
      assert.match(err.message ?? '', /rationale/i);
    }
    assert.ok(threw, `expected rejection for rationale=${JSON.stringify(bad)}`);
  }
});

test('AC4: CALIBRATION → ACTIVE with rationale < 100 chars → 400', async () => {
  const { prisma } = makeFake({ currentMode: 'CALIBRATION' });
  const svc = new OrgSettingsService(prisma);
  let threw = false;
  try {
    await svc.transitionPromotionMode(ORG_ID, { promotionMode: 'ACTIVE', rationale: 'a'.repeat(99) }, ACTOR);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
    assert.match(err.message ?? '', /≥\s*100/);
  }
  assert.ok(threw);
});

test('AC4: CALIBRATION → ACTIVE with rationale ≥ 100 chars succeeds + emits audit', async () => {
  const { prisma, calls } = makeFake({ currentMode: 'CALIBRATION' });
  const svc = new OrgSettingsService(prisma);
  const result = await svc.transitionPromotionMode(ORG_ID, { promotionMode: 'ACTIVE', rationale: LONG_RATIONALE }, ACTOR);
  assert.equal(result.promotionMode, 'ACTIVE');
  assert.equal(result.changedBy, ADMIN_ID);
  assert.ok(result.changedAt, 'changedAt must be set');
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].data.promotionMode, 'ACTIVE');
  assert.equal(calls.update[0].data.promotionModeChangedBy, ADMIN_ID);
  assert.equal(calls.outboxCreate.length, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'organization.promotion_mode.changed');
  assert.equal(outbox.aggregateType, 'organization');
  assert.equal(outbox.aggregateId, ORG_ID);
  assert.equal(outbox.payload.before.fromMode, 'CALIBRATION');
  assert.equal(outbox.payload.after.toMode, 'ACTIVE');
  assert.equal(outbox.payload.reason, LONG_RATIONALE);
  // Race-fix: SELECT ... FOR UPDATE before the read
  assert.ok(calls.rawSql.find((r) => /FOR UPDATE/i.test(r.sql)), 'must acquire row lock before read');
});

// ── AC5: ACTIVE → CALIBRATION allows rationale, no snapshot ────────
test('AC5: ACTIVE → CALIBRATION without rationale succeeds', async () => {
  const { prisma, calls } = makeFake({ currentMode: 'ACTIVE' });
  const svc = new OrgSettingsService(prisma);
  const result = await svc.transitionPromotionMode(ORG_ID, { promotionMode: 'CALIBRATION' }, ACTOR);
  assert.equal(result.promotionMode, 'CALIBRATION');
  assert.equal(calls.outboxCreate.length, 1);
  assert.equal(calls.outboxCreate[0].data.payload.before.fromMode, 'ACTIVE');
  assert.equal(calls.outboxCreate[0].data.payload.after.toMode, 'CALIBRATION');
  assert.equal(calls.outboxCreate[0].data.payload.reason, null);
});

test('AC5: ACTIVE → CALIBRATION with optional rationale captures it on the event', async () => {
  const { prisma, calls } = makeFake({ currentMode: 'ACTIVE' });
  const svc = new OrgSettingsService(prisma);
  await svc.transitionPromotionMode(ORG_ID, { promotionMode: 'CALIBRATION', rationale: 'rolling back due to perf concerns' }, ACTOR);
  assert.equal(calls.outboxCreate[0].data.payload.reason, 'rolling back due to perf concerns');
});

// ── AC6: audit event validates against AuditEventSchema ────────────
test('AC6: emitted payload validates against AuditEvent taxonomy (OrganizationPromotionModeChanged)', async () => {
  const { prisma, calls } = makeFake({ currentMode: 'CALIBRATION' });
  const svc = new OrgSettingsService(prisma);
  await svc.transitionPromotionMode(ORG_ID, { promotionMode: 'ACTIVE', rationale: LONG_RATIONALE }, ACTOR);
  const outbox = calls.outboxCreate[0].data;
  const candidate = {
    eventId: outbox.eventId,
    occurredAt: new Date().toISOString(),
    actorId: ADMIN_ID,
    organizationId: outbox.organizationId,
    entityType: outbox.aggregateType,
    entityId: outbox.aggregateId,
    eventType: outbox.eventType,
    ...outbox.payload,
  };
  const parsed = safeParseAuditEvent(candidate);
  assert.equal(parsed.ok, true, `relay would reject: ${JSON.stringify(parsed)}`);
});

// ── idempotent no-op ───────────────────────────────────────────────
test('transition to current mode is a no-op (no DB write, no audit emit)', async () => {
  const { prisma, calls } = makeFake({ currentMode: 'ACTIVE' });
  const svc = new OrgSettingsService(prisma);
  const result = await svc.transitionPromotionMode(ORG_ID, { promotionMode: 'ACTIVE' }, ACTOR);
  assert.equal(result.promotionMode, 'ACTIVE');
  assert.equal(calls.update.length, 0);
  assert.equal(calls.outboxCreate.length, 0);
});

test('Reviewer M1/M2: no-op on never-transitioned org returns null/null, NOT fake actor/1970 sentinel', async () => {
  // currentMode is CALIBRATION (the default), no changedAt/changedBy.
  const { prisma } = makeFake({ currentMode: 'CALIBRATION' });
  const svc = new OrgSettingsService(prisma);
  const result = await svc.transitionPromotionMode(ORG_ID, { promotionMode: 'CALIBRATION' }, ACTOR);
  assert.equal(result.promotionMode, 'CALIBRATION');
  assert.equal(result.changedAt, null, 'never-transitioned changedAt must be null, not 1970');
  assert.equal(result.changedBy, null, 'never-transitioned changedBy must be null, not the caller');
});

test('rejects unknown promotionMode value', async () => {
  const { prisma } = makeFake({ currentMode: 'CALIBRATION' });
  const svc = new OrgSettingsService(prisma);
  for (const bad of ['PAUSED', '', null, 1]) {
    let threw = false;
    try { await svc.transitionPromotionMode(ORG_ID, { promotionMode: bad, rationale: LONG_RATIONALE }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
    assert.ok(threw);
  }
});

test('promotionMode enum mirrors Prisma.PromotionMode (drift detector)', async () => {
  const { PromotionMode } = await import('@prisma/client');
  assert.deepEqual(Object.values(PromotionMode).sort(), ['ACTIVE', 'CALIBRATION']);
});
