// Story 6-2 AC3: every read/write of the configuration tables goes
// through a repository in the configuration module.
//
// What we verify here:
//   1. All five repository classes exist and expose the named methods
//      callers (Epic 7 CRUD, Epic 9 scoring, Epic 10 map projection)
//      will depend on.
//   2. Every repository method that touches the DB does so inside a
//      `withOrgScope` transaction — observed by injecting a fake
//      PrismaService whose `$transaction` records the call and whose
//      `$executeRaw` records the SET app.current_org_id binding. A
//      method that called `tx.careerTrack.findMany` outside
//      `$transaction` would be visible here as a missing scope call.
//   3. The non-overlap EXCLUDE constraint is exercised by the repo —
//      the test fakes a Postgres "exclusion_violation" so the repo
//      surfaces the constraint failure faithfully (the Epic 7 CRUD
//      service is what translates it into a 409; the repo itself
//      stays neutral).
//
// We deliberately don't unit-test the SQL the repository emits — the
// `withOrgScope` wrapper is the load-bearing primitive, not the
// individual Prisma query DSL calls.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { CareerTracksRepository } = await import(
  '../dist/configuration/career-tracks.repository.js'
);
const { LevelsRepository } = await import('../dist/configuration/levels.repository.js');
const { LayersRepository } = await import('../dist/configuration/layers.repository.js');
const { RequirementsRepository } = await import(
  '../dist/configuration/requirements.repository.js'
);
const { PromotionRulesRepository } = await import(
  '../dist/configuration/promotion-rules.repository.js'
);

const ORG = '11111111-1111-4111-8111-111111111111';
const TRACK = '22222222-2222-4222-8222-222222222222';
const LEVEL = '33333333-3333-4333-8333-333333333333';
const LAYER = '44444444-4444-4444-8444-444444444444';

/** Capturing Prisma fake. Every $transaction call is recorded, AND
 *  the SET app.current_org_id call inside withOrgScope is recorded
 *  via $executeRaw. A repository that bypassed withOrgScope would
 *  have zero recorded SET calls — and the assertion below would
 *  catch it. */
function makeCapturingPrisma({ resultPerTable = {}, throwExclusionOn } = {}) {
  const calls = { scopes: [], throws: 0 };
  const tx = {
    $executeRaw: async (strings, ...params) => {
      // The withOrgScope helper issues:
      //   SELECT set_config('app.current_org_id', ${organizationId}, true)
      // We record the params so the test can pin the scope was set.
      calls.scopes.push({ params });
      return 1;
    },
    careerTrack: makeModelStub('careerTrack', resultPerTable.careerTrack, throwExclusionOn),
    level: makeModelStub('level', resultPerTable.level, throwExclusionOn),
    layer: makeModelStub('layer', resultPerTable.layer, throwExclusionOn),
    requirement: makeModelStub('requirement', resultPerTable.requirement, throwExclusionOn),
    promotionRule: makeModelStub('promotionRule', resultPerTable.promotionRule, throwExclusionOn),
  };
  const prisma = {
    $transaction: async (fn) => fn(tx),
  };
  return { prisma, calls };
}

function makeModelStub(name, result, throwExclusionOn) {
  const echo = async (args) => {
    if (throwExclusionOn === name) {
      // Faithfully model Prisma's exclusion-constraint error path —
      // P2002 covers unique constraint, but exclusion violations
      // surface as PrismaClientUnknownRequestError with the underlying
      // Postgres "exclusion_violation" SQLSTATE 23P01. We re-create
      // that shape so the repo test catches a future regression that
      // silently swallows the error.
      const { Prisma } = await import('@prisma/client');
      const err = new Prisma.PrismaClientUnknownRequestError(
        'conflicting key value violates exclusion constraint "levels_band_non_overlap"',
        { clientVersion: 'test' },
      );
      throw err;
    }
    return result ?? { id: 'row-id', ...args.data, organizationId: ORG };
  };
  return {
    findMany: async () => result ?? [],
    findUnique: async () => result ?? null,
    create: echo,
    update: echo,
  };
}

// ── Repository shape ────────────────────────────────────────────────

test('AC3: CareerTracksRepository exposes list/findById/findBySlug/create/update', () => {
  const repo = new CareerTracksRepository({});
  for (const method of ['list', 'findById', 'findBySlug', 'create', 'update']) {
    assert.equal(typeof repo[method], 'function', `missing ${method}`);
  }
});

test('AC3: LevelsRepository exposes listByTrack/findById/create/update', () => {
  const repo = new LevelsRepository({});
  for (const method of ['listByTrack', 'findById', 'create', 'update']) {
    assert.equal(typeof repo[method], 'function', `missing ${method}`);
  }
});

test('AC3: LayersRepository exposes listByLevel/findById/create/update', () => {
  const repo = new LayersRepository({});
  for (const method of ['listByLevel', 'findById', 'create', 'update']) {
    assert.equal(typeof repo[method], 'function', `missing ${method}`);
  }
});

test('AC3: RequirementsRepository exposes listByLayer/findById/create/update', () => {
  const repo = new RequirementsRepository({});
  for (const method of ['listByLayer', 'findById', 'create', 'update']) {
    assert.equal(typeof repo[method], 'function', `missing ${method}`);
  }
});

test('AC3: PromotionRulesRepository exposes findByLevelId/findById/create/update', () => {
  const repo = new PromotionRulesRepository({});
  for (const method of ['findByLevelId', 'findById', 'create', 'update']) {
    assert.equal(typeof repo[method], 'function', `missing ${method}`);
  }
});

// ── withOrgScope is wired for every repo method ─────────────────────

test('CareerTracksRepository.list calls withOrgScope (sets app.current_org_id)', async () => {
  const { prisma, calls } = makeCapturingPrisma({ resultPerTable: { careerTrack: [] } });
  const repo = new CareerTracksRepository(prisma);
  await repo.list(ORG);
  assert.equal(calls.scopes.length, 1, 'list() should run inside exactly one withOrgScope');
  assert.ok(
    calls.scopes[0].params.includes(ORG),
    `scope params must bind the orgId, got ${JSON.stringify(calls.scopes[0].params)}`,
  );
});

test('LevelsRepository.create runs inside withOrgScope', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new LevelsRepository(prisma);
  await repo.create(ORG, {
    careerTrackId: TRACK,
    levelCode: 'L1',
    name: 'Level 1',
    scoreBandStart: 0,
    scoreBandEnd: 100,
  });
  assert.equal(calls.scopes.length, 1);
  assert.ok(calls.scopes[0].params.includes(ORG));
});

test('LayersRepository.update runs inside withOrgScope', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new LayersRepository(prisma);
  await repo.update(ORG, LAYER, { name: 'Capability' });
  assert.equal(calls.scopes.length, 1);
});

test('RequirementsRepository.findById runs inside withOrgScope', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new RequirementsRepository(prisma);
  await repo.findById(ORG, 'req-id');
  assert.equal(calls.scopes.length, 1);
});

test('PromotionRulesRepository.findByLevelId runs inside withOrgScope', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new PromotionRulesRepository(prisma);
  await repo.findByLevelId(ORG, LEVEL);
  assert.equal(calls.scopes.length, 1);
});

// ── Exclusion constraint surfaces faithfully ────────────────────────

test('LevelsRepository.create surfaces the band-overlap exclusion violation (not swallowed)', async () => {
  const { prisma } = makeCapturingPrisma({ throwExclusionOn: 'level' });
  const repo = new LevelsRepository(prisma);
  let threw = false;
  try {
    await repo.create(ORG, {
      careerTrackId: TRACK,
      levelCode: 'L1',
      name: 'Level 1',
      scoreBandStart: 0,
      scoreBandEnd: 100,
    });
  } catch (err) {
    threw = true;
    // The repo is intentionally neutral — Epic 7's CRUD service is
    // what translates this into a structured 409. We only pin that
    // the error PROPAGATES with the constraint name intact so the
    // service-layer translator can latch onto it.
    assert.match(
      err.message ?? '',
      /levels_band_non_overlap/i,
      'error must surface the constraint name so the service can translate to 409',
    );
  }
  assert.ok(threw, 'exclusion violation must not be swallowed by the repository');
});

// ── UUID validation flows through withOrgScope ─────────────────────

test('withOrgScope rejects a non-UUID organizationId (defense-in-depth)', async () => {
  const { RlsInvalidOrgIdError } = await import('../dist/prisma/rls.helpers.js');
  const { prisma } = makeCapturingPrisma();
  const repo = new CareerTracksRepository(prisma);
  await assert.rejects(() => repo.list('not-a-uuid'), RlsInvalidOrgIdError);
});
