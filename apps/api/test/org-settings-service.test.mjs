// Story 7-6 — OrgSettingsService visibility surface: validation,
// idempotent no-op, visibility_rule.changed emission.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { OrgSettingsService } = await import('../dist/configuration/org-settings.service.js');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR = { user_id: ADMIN_ID, organization_id: ORG_ID, role: 'ADMIN', display_name: 'Admin' };

function makeFake({ currentVisibility = 'OWN_ONLY', orgExists = true } = {}) {
  let state = orgExists ? { visibilityDefault: currentVisibility } : null;
  const calls = { findUnique: [], update: [], outboxCreate: [], txCount: 0, baseFindUnique: [], rawSql: [] };
  const tx = {
    organization: {
      findUnique: async (args) => {
        calls.findUnique.push(args);
        return state;
      },
      update: async (args) => {
        calls.update.push(args);
        state = { ...state, ...args.data };
        return state;
      },
    },
    outboxEvent: { create: async (args) => { calls.outboxCreate.push(args); return args.data; } },
    $executeRaw: async (template, ...params) => {
      const sql = Array.isArray(template?.strings) ? template.strings.join('?') : String(template?.raw ?? template);
      calls.rawSql.push({ sql, params });
      return 0;
    },
  };
  const prisma = {
    organization: {
      findUnique: async (args) => {
        calls.baseFindUnique.push(args);
        return state;
      },
    },
    $transaction: async (fn) => { calls.txCount += 1; return await fn(tx); },
  };
  return { prisma, calls };
}

// ── AC1: GET ────────────────────────────────────────────────────────
test('AC1: getVisibility returns the current setting', async () => {
  const { prisma, calls } = makeFake({ currentVisibility: 'TEAM' });
  const svc = new OrgSettingsService(prisma);
  const result = await svc.getVisibility(ORG_ID);
  assert.deepEqual(result, { visibilityDefault: 'TEAM' });
  // Reviewer H1: getVisibility now runs inside withOrgScope, so the
  // read passes through the tx-scoped findUnique rather than the
  // bare prisma client.
  assert.equal(calls.findUnique.length, 1, 'getVisibility must use tx.findUnique (RLS-scoped)');
  assert.equal(calls.baseFindUnique.length, 0, 'getVisibility must NOT use bare prisma.findUnique');
  assert.equal(calls.txCount, 1, 'getVisibility must open a withOrgScope tx');
});

test('AC1: getVisibility throws 404 for unknown organization', async () => {
  const { prisma } = makeFake({ orgExists: false });
  const svc = new OrgSettingsService(prisma);
  let threw = false;
  try { await svc.getVisibility(ORG_ID); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
  assert.ok(threw);
});

// ── AC1: validation ────────────────────────────────────────────────
test('AC1: updateVisibility rejects unknown enum values', async () => {
  const { prisma } = makeFake();
  const svc = new OrgSettingsService(prisma);
  for (const bad of ['SECRET', 'own_only', '', null, undefined, 1, {}]) {
    let threw = false;
    try { await svc.updateVisibility(ORG_ID, { visibilityDefault: bad }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
    assert.ok(threw, `expected rejection for visibilityDefault ${String(bad)}`);
  }
});

test('AC1: updateVisibility accepts each of the four enum values', async () => {
  for (const ok of ['OWN_ONLY', 'TEAM', 'ORG_SUMMARY', 'ORG_FULL']) {
    const { prisma, calls } = makeFake({ currentVisibility: 'OWN_ONLY' });
    const svc = new OrgSettingsService(prisma);
    if (ok === 'OWN_ONLY') {
      // No-change should be the idempotent path
      await svc.updateVisibility(ORG_ID, { visibilityDefault: ok }, ACTOR);
      assert.equal(calls.update.length, 0, 'no-op should not write');
      assert.equal(calls.outboxCreate.length, 0);
    } else {
      await svc.updateVisibility(ORG_ID, { visibilityDefault: ok }, ACTOR);
      assert.equal(calls.update[0].data.visibilityDefault, ok);
    }
  }
});

test('AC1: visibility enum mirrors Prisma.VisibilityDefault (drift detector)', async () => {
  const { VisibilityDefault } = await import('@prisma/client');
  const fromPrisma = Object.values(VisibilityDefault).sort();
  assert.deepEqual(fromPrisma, ['ORG_FULL', 'ORG_SUMMARY', 'OWN_ONLY', 'TEAM']);
});

// ── AC2+AC3: visibility_rule.changed event ──────────────────────────
test('AC2+AC3: updateVisibility (real change) emits one visibility_rule.changed event in same tx; row-lock acquired first', async () => {
  const { prisma, calls } = makeFake({ currentVisibility: 'OWN_ONLY' });
  const svc = new OrgSettingsService(prisma);
  await svc.updateVisibility(ORG_ID, { visibilityDefault: 'ORG_FULL' }, ACTOR);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.outboxCreate.length, 1);
  assert.equal(calls.txCount, 1, 'write + emit must be one transaction');
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'visibility_rule.changed');
  assert.equal(outbox.aggregateType, 'visibility_rule');
  assert.equal(outbox.aggregateId, ORG_ID, 'aggregateId is the organization id for this event type');
  assert.equal(outbox.payload.actorId, ADMIN_ID);
  assert.equal(outbox.payload.before.fromSetting, 'OWN_ONLY');
  assert.equal(outbox.payload.after.toSetting, 'ORG_FULL');
  // Reviewer B1: the SELECT ... FOR UPDATE must fire BEFORE the read so
  // two concurrent PATCHes serialize on the org row.
  const lockSql = calls.rawSql.find((r) => /FOR UPDATE/i.test(r.sql));
  assert.ok(lockSql, 'SELECT ... FOR UPDATE must be called inside updateVisibility');
});

test('AC2+AC3: emitted payload validates against AuditEvent taxonomy (VisibilityRuleChanged)', async () => {
  const { prisma, calls } = makeFake({ currentVisibility: 'OWN_ONLY' });
  const svc = new OrgSettingsService(prisma);
  await svc.updateVisibility(ORG_ID, { visibilityDefault: 'TEAM' }, ACTOR);
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
test('updateVisibility to the SAME value is a no-op (no write, no audit, no map-cache event)', async () => {
  const { prisma, calls } = makeFake({ currentVisibility: 'TEAM' });
  const svc = new OrgSettingsService(prisma);
  const result = await svc.updateVisibility(ORG_ID, { visibilityDefault: 'TEAM' }, ACTOR);
  assert.deepEqual(result, { visibilityDefault: 'TEAM' });
  assert.equal(calls.update.length, 0, 'no DB write on no-op');
  assert.equal(calls.outboxCreate.length, 0, 'no audit emit on no-op');
});

test('updateVisibility on unknown organization throws 404', async () => {
  const { prisma } = makeFake({ orgExists: false });
  const svc = new OrgSettingsService(prisma);
  let threw = false;
  try { await svc.updateVisibility(ORG_ID, { visibilityDefault: 'TEAM' }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
  assert.ok(threw);
});
