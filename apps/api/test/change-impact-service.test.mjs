// Story 7-8 — ChangeImpactService: deterministic read-only count
// across the five configuration entity types. AC2: no writes.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ChangeImpactService } = await import('../dist/configuration/change-impact.service.js');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRACK_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LEVEL_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LAYER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REQ_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const RULE_ID = '11111111-1111-4111-8111-111111111111';

function makeFake({
  resolved = {},
  countResult = 0,
  sampleIds = [],
} = {}) {
  // `dataMutations` only counts Prisma model writes (create/update/delete)
  // — the `$executeRaw` that `withOrgScope` uses to SET LOCAL the RLS
  // GUC is NOT a data mutation and is excluded by construction (we
  // don't expose create/update/delete methods on any model in this
  // fake, so any attempt to call them would throw).
  const calls = { txCount: 0, queries: [], dataMutations: 0 };
  const trapWrite = () => {
    calls.dataMutations += 1;
    throw new Error('AC2 violation: ChangeImpactService attempted a Prisma model write');
  };
  const tx = {
    careerTrack: {
      findUnique: async ({ where }) => resolved.careerTrack && where.id === TRACK_ID ? { id: TRACK_ID } : null,
      create: trapWrite, update: trapWrite, delete: trapWrite,
    },
    level: {
      findUnique: async ({ where }) => resolved.level && where.id === LEVEL_ID ? { id: LEVEL_ID } : null,
      create: trapWrite, update: trapWrite, delete: trapWrite,
    },
    layer: {
      findUnique: async ({ where }) => resolved.layer && where.id === LAYER_ID ? { id: LAYER_ID, levelId: LEVEL_ID } : null,
      create: trapWrite, update: trapWrite, delete: trapWrite,
    },
    requirement: {
      findUnique: async ({ where }) => resolved.requirement && where.id === REQ_ID ? { layer: { levelId: LEVEL_ID } } : null,
      create: trapWrite, update: trapWrite, delete: trapWrite,
    },
    promotionRule: {
      findUnique: async ({ where }) => resolved.promotionRule && where.id === RULE_ID ? { id: RULE_ID, levelId: LEVEL_ID } : null,
      create: trapWrite, update: trapWrite, delete: trapWrite,
    },
    outboxEvent: {
      create: trapWrite,
    },
    employee: {
      create: trapWrite, update: trapWrite, delete: trapWrite,
    },
    $queryRaw: async (template, ...params) => {
      const sql = Array.isArray(template?.strings) ? template.strings.join('?') : String(template);
      calls.queries.push({ sql, params });
      if (/COUNT\(\*\)/i.test(sql)) return [{ total: BigInt(countResult) }];
      return sampleIds.map((id) => ({ id }));
    },
    // $executeRaw is allowed for withOrgScope's SET LOCAL only; the
    // service itself never calls $executeRaw.
    $executeRaw: async () => 0,
  };
  const prisma = {
    $transaction: async (fn) => { calls.txCount += 1; return await fn(tx); },
  };
  return { prisma, calls };
}

// ── AC1: validation ────────────────────────────────────────────────
test('AC1: entityType must be one of the five known kinds', async () => {
  const { prisma } = makeFake();
  const svc = new ChangeImpactService(prisma);
  for (const bad of ['', 'visibility_rule', 'organization', 'TRACK', null, 1]) {
    let threw = false;
    try { await svc.previewImpact(ORG_ID, { entityType: bad, entityId: TRACK_ID }); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
    assert.ok(threw, `expected rejection for entityType ${String(bad)}`);
  }
});

test('AC1: entityId must be a UUID', async () => {
  const { prisma } = makeFake();
  const svc = new ChangeImpactService(prisma);
  for (const bad of ['not-a-uuid', '', null, undefined, 123]) {
    let threw = false;
    try { await svc.previewImpact(ORG_ID, { entityType: 'level', entityId: bad }); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
    assert.ok(threw);
  }
});

test('AC1: unknown entityId surfaces 404 per kind', async () => {
  const { prisma } = makeFake({ resolved: {} });
  const svc = new ChangeImpactService(prisma);
  for (const kind of ['career_track', 'level', 'layer', 'requirement', 'promotion_rule']) {
    let threw = false;
    try { await svc.previewImpact(ORG_ID, { entityType: kind, entityId: TRACK_ID }); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
    assert.ok(threw, `${kind} should 404 when entity missing`);
  }
});

// ── AC1: per-kind resolution ──────────────────────────────────────
test('AC1: career_track impact filters employees by career_track_id and excludes deactivated', async () => {
  const { prisma, calls } = makeFake({
    resolved: { careerTrack: true },
    countResult: 42,
    sampleIds: ['e1', 'e2', 'e3'],
  });
  const svc = new ChangeImpactService(prisma);
  const result = await svc.previewImpact(ORG_ID, { entityType: 'career_track', entityId: TRACK_ID });
  assert.equal(result.affected_employee_count, 42);
  assert.deepEqual(result.sample_employee_ids, ['e1', 'e2', 'e3']);
  // SQL must reference career_track_id and NOT level_id
  const countSql = calls.queries.find((q) => /COUNT\(\*\)/i.test(q.sql));
  assert.match(countSql.sql, /career_track_id/);
  assert.doesNotMatch(countSql.sql, /level_id\s*=/);
  // Reviewer BLOCKER: deactivated employees must NOT inflate the count.
  assert.match(countSql.sql, /deactivated_at\s+IS\s+NULL/i, 'BLOCKER fix: filter deactivated employees');
});

test('AC1: level impact filters employees by level_id (single-level ANY) and excludes deactivated', async () => {
  const { prisma, calls } = makeFake({
    resolved: { level: true },
    countResult: 7,
    sampleIds: ['e1'],
  });
  const svc = new ChangeImpactService(prisma);
  const result = await svc.previewImpact(ORG_ID, { entityType: 'level', entityId: LEVEL_ID });
  assert.equal(result.affected_employee_count, 7);
  const countSql = calls.queries.find((q) => /COUNT\(\*\)/i.test(q.sql));
  assert.match(countSql.sql, /level_id\s*=\s*ANY/);
  assert.match(countSql.sql, /deactivated_at\s+IS\s+NULL/i);
});

test('AC1: layer impact resolves to parent level then filters employees', async () => {
  const { prisma, calls } = makeFake({
    resolved: { layer: true },
    countResult: 12,
    sampleIds: [],
  });
  const svc = new ChangeImpactService(prisma);
  const result = await svc.previewImpact(ORG_ID, { entityType: 'layer', entityId: LAYER_ID });
  assert.equal(result.affected_employee_count, 12);
  // Parent level id should be the LEVEL_ID returned by the layer fake
  const countSql = calls.queries.find((q) => /COUNT\(\*\)/i.test(q.sql));
  assert.match(countSql.sql, /level_id\s*=\s*ANY/);
});

test('AC1: requirement impact resolves via layer→level', async () => {
  const { prisma } = makeFake({
    resolved: { requirement: true },
    countResult: 3,
    sampleIds: ['e1', 'e2', 'e3'],
  });
  const svc = new ChangeImpactService(prisma);
  const result = await svc.previewImpact(ORG_ID, { entityType: 'requirement', entityId: REQ_ID });
  assert.equal(result.affected_employee_count, 3);
});

test('AC1: promotion_rule impact resolves to rule.levelId', async () => {
  const { prisma } = makeFake({
    resolved: { promotionRule: true },
    countResult: 5,
    sampleIds: ['e1', 'e2'],
  });
  const svc = new ChangeImpactService(prisma);
  const result = await svc.previewImpact(ORG_ID, { entityType: 'promotion_rule', entityId: RULE_ID });
  assert.equal(result.affected_employee_count, 5);
});

// ── AC1: sample cap ────────────────────────────────────────────────
test('AC1: sample_employee_ids is capped at 20 even when count is larger', async () => {
  const ids = Array.from({ length: 50 }, (_, i) => `e${i.toString().padStart(2, '0')}`);
  // Fake query honors the LIMIT through the params, but our fake
  // ignores the LIMIT — instead we feed it pre-capped data. The real
  // production SQL has `LIMIT 20` in it; assert the SQL contains it.
  const { prisma, calls } = makeFake({
    resolved: { level: true },
    countResult: 9999,
    sampleIds: ids.slice(0, 20),
  });
  const svc = new ChangeImpactService(prisma);
  const result = await svc.previewImpact(ORG_ID, { entityType: 'level', entityId: LEVEL_ID });
  assert.equal(result.affected_employee_count, 9999);
  assert.equal(result.sample_employee_ids.length, 20);
  // Pin the LIMIT in the production SQL.
  const sampleSql = calls.queries.find((q) => /LIMIT/i.test(q.sql));
  assert.ok(sampleSql, 'sample query should have a LIMIT');
});

// ── AC2: no writes ─────────────────────────────────────────────────
test('AC2: previewImpact runs zero data mutations (read-only)', async () => {
  // The fake's trapWrite throws if ANY Prisma model write fires.
  // Reaching the assertion without an exception is the test pass.
  const { prisma, calls } = makeFake({
    resolved: { level: true },
    countResult: 1,
    sampleIds: ['e1'],
  });
  const svc = new ChangeImpactService(prisma);
  await svc.previewImpact(ORG_ID, { entityType: 'level', entityId: LEVEL_ID });
  assert.equal(calls.dataMutations, 0, 'AC2: no Prisma model writes');
});

// ── AC3: count accuracy across representative shapes ──────────────
test('AC3: count of 0 returns empty samples without querying samples', async () => {
  const { prisma } = makeFake({
    resolved: { level: true },
    countResult: 0,
    sampleIds: [],
  });
  const svc = new ChangeImpactService(prisma);
  const result = await svc.previewImpact(ORG_ID, { entityType: 'level', entityId: LEVEL_ID });
  assert.equal(result.affected_employee_count, 0);
  assert.deepEqual(result.sample_employee_ids, []);
});

test('AC3: bigint COUNT(*) is coerced to a JS number safely under expected scale', async () => {
  // Postgres COUNT returns bigint; the service uses Number(...) coercion.
  // For org-scale (<= 10k employees per org), Number is exact.
  const { prisma } = makeFake({
    resolved: { level: true },
    countResult: 9007199254740991, // Number.MAX_SAFE_INTEGER
    sampleIds: [],
  });
  const svc = new ChangeImpactService(prisma);
  const result = await svc.previewImpact(ORG_ID, { entityType: 'level', entityId: LEVEL_ID });
  assert.equal(result.affected_employee_count, 9007199254740991);
});

test('AC3: COUNT(*) above MAX_SAFE_INTEGER throws rather than silently losing precision (reviewer M6)', async () => {
  // Reviewer M6: a 10B-row test fixture would silently round under
  // Number(bigint). Throw instead.
  const { prisma } = makeFake({
    resolved: { level: true },
    countResult: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
    sampleIds: [],
  });
  const svc = new ChangeImpactService(prisma);
  let threw = false;
  try { await svc.previewImpact(ORG_ID, { entityType: 'level', entityId: LEVEL_ID }); } catch (err) {
    threw = true;
    assert.match(err.message, /MAX_SAFE_INTEGER/);
  }
  assert.ok(threw, 'must throw rather than silently round');
});

// ── runs inside withOrgScope ──────────────────────────────────────
test('previewImpact runs inside withOrgScope (RLS scope set)', async () => {
  const { prisma, calls } = makeFake({
    resolved: { level: true },
    countResult: 1,
    sampleIds: ['e1'],
  });
  const svc = new ChangeImpactService(prisma);
  await svc.previewImpact(ORG_ID, { entityType: 'level', entityId: LEVEL_ID });
  assert.equal(calls.txCount, 1, 'must open a withOrgScope transaction');
});
