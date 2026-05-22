// Story 7-5 — PromotionRulesService: one rule per level, no delete.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { PromotionRulesService } = await import('../dist/configuration/promotion-rules.service.js');
const { Prisma } = await import('@prisma/client');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LEVEL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RULE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ACTOR = { user_id: ADMIN_ID, organization_id: ORG_ID, role: 'ADMIN', display_name: 'Admin' };

function makeFake({ existing = null, levelExists = true, throwOnCreate = null } = {}) {
  let state = existing ? { ...existing } : null;
  const calls = { create: [], update: [], findUnique: [], outboxCreate: [], txCount: 0 };
  const tx = {
    promotionRule: {
      create: async (args) => {
        calls.create.push(args);
        if (throwOnCreate) throw throwOnCreate;
        const now = new Date();
        state = {
          id: RULE_ID,
          organizationId: args.data.organizationId,
          levelId: args.data.levelId,
          minScore: args.data.minScore,
          minTimeAtLevelMonths: args.data.minTimeAtLevelMonths ?? null,
          mandatoryCompletion: args.data.mandatoryCompletion ?? true,
          managerRequired: args.data.managerRequired ?? true,
          hrRequired: args.data.hrRequired ?? false,
          blockerCheck: args.data.blockerCheck ?? true,
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
  };
  const prisma = { $transaction: async (fn) => { calls.txCount += 1; return await fn(tx); } };
  const repo = {
    findByLevelId: async () => state,
    findById: async () => state,
  };
  const levelsRepo = { findById: async () => (levelExists ? { id: LEVEL_ID } : null) };
  return { prisma, repo, levelsRepo, calls };
}

// ── AC1: 404 on unknown level ───────────────────────────────────────
test('AC1: GET under unknown levelId throws 404', async () => {
  const { prisma, repo, levelsRepo } = makeFake({ levelExists: false });
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  let threw = false;
  try { await svc.findByLevelId(ORG_ID, LEVEL_ID); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
  assert.ok(threw);
});

test('GET on level with no rule yet throws 404 (distinct from unknown level)', async () => {
  const { prisma, repo, levelsRepo } = makeFake({ existing: null, levelExists: true });
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  let threw = false;
  try { await svc.findByLevelId(ORG_ID, LEVEL_ID); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); assert.match(err.message ?? '', /No promotion rule configured/); }
  assert.ok(threw);
});

test('AC1: create() under unknown levelId throws 404', async () => {
  const { prisma, repo, levelsRepo } = makeFake({ levelExists: false });
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  let threw = false;
  try { await svc.create(ORG_ID, LEVEL_ID, { minScore: 100 }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
  assert.ok(threw);
});

// ── AC2: defaults match PRD §8.5 ────────────────────────────────────
test('AC2: create() with minimal input applies PRD §8.5 defaults (manager=true, hr=false, blocker=true, mandatory=true)', async () => {
  const { prisma, repo, levelsRepo, calls } = makeFake();
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  const rule = await svc.create(ORG_ID, LEVEL_ID, { minScore: 100 }, ACTOR);
  assert.equal(rule.mandatoryCompletion, true);
  assert.equal(rule.managerRequired, true);
  assert.equal(rule.hrRequired, false);
  assert.equal(rule.blockerCheck, true);
  assert.equal(rule.minTimeAtLevelMonths, null);
  // Pin: defaults flow through to the DB layer
  assert.equal(calls.create[0].data.mandatoryCompletion, true);
  assert.equal(calls.create[0].data.hrRequired, false);
});

test('AC2: create() respects explicit overrides for every boolean gate', async () => {
  const { prisma, repo, levelsRepo, calls } = makeFake();
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  await svc.create(ORG_ID, LEVEL_ID, {
    minScore: 100,
    minTimeAtLevelMonths: 6,
    mandatoryCompletion: false,
    managerRequired: false,
    hrRequired: true,
    blockerCheck: false,
  }, ACTOR);
  const data = calls.create[0].data;
  assert.equal(data.mandatoryCompletion, false);
  assert.equal(data.managerRequired, false);
  assert.equal(data.hrRequired, true);
  assert.equal(data.blockerCheck, false);
  assert.equal(data.minTimeAtLevelMonths, 6);
});

// ── AC2: validation ────────────────────────────────────────────────
test('AC2: minScore must be non-negative integer', async () => {
  const { prisma, repo, levelsRepo } = makeFake();
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  for (const bad of [-1, 1.5, 'one', null, undefined, 1_000_001]) {
    let threw = false;
    try { await svc.create(ORG_ID, LEVEL_ID, { minScore: bad }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
    assert.ok(threw, `expected rejection for minScore ${String(bad)}`);
  }
});

test('AC2: minTimeAtLevelMonths is null OR non-negative integer (matches DB CHECK)', async () => {
  const { prisma, repo, levelsRepo, calls } = makeFake();
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  // null is fine
  await svc.create(ORG_ID, LEVEL_ID, { minScore: 0, minTimeAtLevelMonths: null }, ACTOR);
  assert.equal(calls.create[0].data.minTimeAtLevelMonths, null);
  // 0 is fine (mirrors DB CHECK `IS NULL OR >= 0`; equivalent to "no floor")
  await svc.create(ORG_ID, LEVEL_ID, { minScore: 0, minTimeAtLevelMonths: 0 }, ACTOR);
  // positive is fine
  await svc.create(ORG_ID, LEVEL_ID, { minScore: 0, minTimeAtLevelMonths: 12 }, ACTOR);
  // negative / non-integer / too-large all fail
  for (const bad of [-1, 1.5, 601]) {
    let threw = false;
    try { await svc.create(ORG_ID, LEVEL_ID, { minScore: 0, minTimeAtLevelMonths: bad }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
    assert.ok(threw, `expected rejection for minTimeAtLevelMonths ${String(bad)}`);
  }
});

test('AC2: every boolean gate rejects non-boolean input (no truthiness coercion)', async () => {
  const { prisma, repo, levelsRepo } = makeFake();
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  for (const field of ['mandatoryCompletion', 'managerRequired', 'hrRequired', 'blockerCheck']) {
    for (const bad of ['true', 1, 0, null, []]) {
      let threw = false;
      try { await svc.create(ORG_ID, LEVEL_ID, { minScore: 100, [field]: bad }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
      assert.ok(threw, `${field} should reject ${String(bad)}`);
    }
  }
});

// ── one-per-level constraint (P2002) → 409 ──────────────────────────
test('AC1: second create() for same level surfaces as 409', async () => {
  const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002', clientVersion: 'test', meta: { target: ['level_id'] },
  });
  const { prisma, repo, levelsRepo } = makeFake({ throwOnCreate: p2002 });
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  let threw = false;
  try { await svc.create(ORG_ID, LEVEL_ID, { minScore: 100 }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 409); assert.match(err.message ?? '', /one per level/i); }
  assert.ok(threw);
});

// ── AC3: audit emission ────────────────────────────────────────────
test('AC3: create() emits one configuration.changed event with configEntityType=promotion_rule', async () => {
  const { prisma, repo, levelsRepo, calls } = makeFake();
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  await svc.create(ORG_ID, LEVEL_ID, { minScore: 100 }, ACTOR);
  assert.equal(calls.outboxCreate.length, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'configuration.changed');
  assert.equal(outbox.payload.before.configEntityType, 'promotion_rule');
  assert.equal(outbox.payload.after.afterValue.minScore, 100);
  // Schema-validate against the relay's AuditEvent taxonomy
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
  assert.equal(safeParseAuditEvent(candidate).ok, true);
});

test('AC3: update() emits with before/after row state', async () => {
  const existing = {
    id: RULE_ID, organizationId: ORG_ID, levelId: LEVEL_ID,
    minScore: 100, minTimeAtLevelMonths: null,
    mandatoryCompletion: true, managerRequired: true, hrRequired: false, blockerCheck: true,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const { prisma, repo, levelsRepo, calls } = makeFake({ existing });
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  await svc.updateByLevelId(ORG_ID, LEVEL_ID, { hrRequired: true, minTimeAtLevelMonths: 6 }, ACTOR);
  assert.equal(calls.outboxCreate.length, 1);
  const p = calls.outboxCreate[0].data.payload;
  assert.equal(p.before.beforeValue.hrRequired, false);
  assert.equal(p.after.afterValue.hrRequired, true);
  assert.equal(p.after.afterValue.minTimeAtLevelMonths, 6);
});

test('update() with empty patch is a no-op', async () => {
  const existing = {
    id: RULE_ID, organizationId: ORG_ID, levelId: LEVEL_ID,
    minScore: 100, minTimeAtLevelMonths: null,
    mandatoryCompletion: true, managerRequired: true, hrRequired: false, blockerCheck: true,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const { prisma, repo, levelsRepo, calls } = makeFake({ existing });
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  await svc.updateByLevelId(ORG_ID, LEVEL_ID, {}, ACTOR);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.outboxCreate.length, 0);
});

test('update() on level with no rule yet throws 404', async () => {
  const { prisma, repo, levelsRepo } = makeFake({ existing: null });
  const svc = new PromotionRulesService(prisma, repo, levelsRepo);
  let threw = false;
  try { await svc.updateByLevelId(ORG_ID, LEVEL_ID, { minScore: 200 }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
  assert.ok(threw);
});

// ── no DELETE surface ──────────────────────────────────────────────
test('PromotionRulesService has NO delete/remove/destroy/deactivate method (TypeScript surface check)', () => {
  assert.equal(typeof PromotionRulesService.prototype.delete, 'undefined');
  assert.equal(typeof PromotionRulesService.prototype.remove, 'undefined');
  assert.equal(typeof PromotionRulesService.prototype.destroy, 'undefined');
  assert.equal(typeof PromotionRulesService.prototype.deactivate, 'undefined');
});
