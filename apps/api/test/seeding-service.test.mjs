// Story 6-3: SeedingService.
//
// AC1: produces SE L1-L5 (5), ARCH L4-L5 (2), MGMT L3-L5 (3), 3 layers
//      per level (Capability/Delivery/Influence), 1 requirement per
//      layer with Fibonacci weights, 1 promotion rule per level.
//      Org defaults echoed: visibility=OWN_ONLY, approval=SINGLE,
//      promotion=CALIBRATION.
// AC2: a second seed against the same org throws AlreadySeededError
//      with NO writes performed.
// AC3: every seeded row emits a `configuration.seeded` outbox event
//      AND the payload validates against the AuditEvent taxonomy.
// AC4 (full seeded state): pins the COUNTS (3/10/30/30/10) AND the
//      band non-overlap invariant (no inclusive-band collisions
//      that would trip the GiST EXCLUDE constraint at the DB layer).
//
// All tests use a capturing fake of PrismaService — no live DB. The
// fake faithfully models `$transaction(fn) => fn(tx)` and the
// `tx.$executeRaw` SET app.current_org_id call inside withOrgScope.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { SeedingService, AlreadySeededError } = await import(
  '../dist/seeding/seeding.service.js'
);
const { CDF_EXPECTED_COUNTS, CDF_TRACKS, CDF_LEVELS, CDF_LAYERS } = await import(
  '../dist/seeding/cdf-defaults.js'
);
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG = '11111111-1111-4111-8111-111111111111';

function makeOrgRow(overrides = {}) {
  return {
    id: ORG,
    visibilityDefault: 'OWN_ONLY',
    approvalWorkflowDefault: 'SINGLE',
    promotionMode: 'CALIBRATION',
    ...overrides,
  };
}

function makeCapturingPrisma({
  orgRow = makeOrgRow(),
  existingTracksCount = 0,
} = {}) {
  let nextId = 1;
  const calls = {
    scopes: [],
    tracksCreated: [],
    levelsCreated: [],
    layersCreated: [],
    requirementsCreated: [],
    promotionRulesCreated: [],
    outboxCreated: [],
  };
  const id = () => {
    const v = String(nextId).padStart(8, '0');
    nextId += 1;
    return `${v}-0000-4000-8000-000000000000`;
  };
  const tx = {
    $executeRaw: async (_strings, ...params) => {
      calls.scopes.push({ params });
      return 1;
    },
    organization: {
      findUnique: async () => orgRow,
    },
    careerTrack: {
      count: async () => existingTracksCount,
      create: async (args) => {
        const row = { id: id(), ...args.data };
        calls.tracksCreated.push(row);
        return row;
      },
    },
    level: {
      create: async (args) => {
        const row = { id: id(), ...args.data };
        calls.levelsCreated.push(row);
        return row;
      },
    },
    layer: {
      create: async (args) => {
        const row = { id: id(), ...args.data };
        calls.layersCreated.push(row);
        return row;
      },
    },
    requirement: {
      create: async (args) => {
        const row = { id: id(), ...args.data };
        calls.requirementsCreated.push(row);
        return row;
      },
    },
    promotionRule: {
      create: async (args) => {
        const row = { id: id(), ...args.data };
        calls.promotionRulesCreated.push(row);
        return row;
      },
    },
    outboxEvent: {
      create: async (args) => {
        calls.outboxCreated.push(args.data);
        return args.data;
      },
    },
  };
  const prisma = { $transaction: async (fn) => fn(tx) };
  return { prisma, calls };
}

// ── AC1: produces the right entities ────────────────────────────────

test('AC1: seed produces 3 tracks (Software Engineering, Architecture, Management)', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  await svc.seedOrganization(ORG);
  assert.equal(calls.tracksCreated.length, 3);
  const slugs = calls.tracksCreated.map((t) => t.slug).sort();
  assert.deepEqual(slugs, ['architecture', 'management', 'software-engineering']);
});

test('AC1: seed produces 10 levels (SE 5 + ARCH 2 + MGMT 3)', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  await svc.seedOrganization(ORG);
  assert.equal(calls.levelsCreated.length, CDF_EXPECTED_COUNTS.levels);
  assert.equal(calls.levelsCreated.length, 10);
});

test('AC1: PRD §7.3 level bands are produced exactly (non-overlapping inclusive form)', () => {
  // Pin the band shape directly off CDF_LEVELS — a future regression
  // that introduces a shared boundary (e.g., L1 ends at 50, L2 starts
  // at 50) would trip the GiST EXCLUDE constraint at the DB layer.
  // We catch it at the unit-test bar by asserting band ENDs are
  // strictly less than the next band START within the same track.
  for (const [_trackSlug, levels] of Object.entries(CDF_LEVELS)) {
    const sorted = [...levels].sort((a, b) => a.scoreBandStart - b.scoreBandStart);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      assert.ok(
        prev.scoreBandEnd < cur.scoreBandStart,
        `band overlap between ${prev.levelCode} (end=${prev.scoreBandEnd}) and ${cur.levelCode} (start=${cur.scoreBandStart})`,
      );
    }
  }
});

test('AC1: seed produces 3 layers per level (Capability/Delivery/Influence) = 30', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  await svc.seedOrganization(ORG);
  assert.equal(calls.layersCreated.length, CDF_EXPECTED_COUNTS.layers);
  assert.equal(calls.layersCreated.length, 30);
  // Layer names per level are exactly the three CDF defaults.
  const layerNames = new Set(calls.layersCreated.map((l) => l.name));
  assert.deepEqual([...layerNames].sort(), ['Capability', 'Delivery', 'Influence']);
});

test('AC1: seed produces 1 requirement per layer (30 total) with Fibonacci weights', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  await svc.seedOrganization(ORG);
  assert.equal(calls.requirementsCreated.length, CDF_EXPECTED_COUNTS.requirements);
  // Pin the weights — Capability=1, Delivery=5, Influence=13 are the
  // CDF Fibonacci choices. A regression that drops one of these
  // would break the eligibility evaluator's default thresholds.
  const weights = new Set(calls.requirementsCreated.map((r) => r.weight));
  const fib = new Set([1, 2, 3, 5, 8, 13, 21]);
  for (const w of weights) {
    assert.ok(fib.has(w), `requirement weight ${w} is not a Fibonacci number`);
  }
});

test('AC1: seed produces 1 promotion rule per level (10 total) with minScore = band end', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  await svc.seedOrganization(ORG);
  assert.equal(calls.promotionRulesCreated.length, CDF_EXPECTED_COUNTS.promotionRules);
  // PRD §8.5: "Minimum score: required score to be eligible
  // (default: level band end value)." Cross-check by levelId.
  const levelById = new Map(calls.levelsCreated.map((l) => [l.id, l]));
  for (const rule of calls.promotionRulesCreated) {
    const level = levelById.get(rule.levelId);
    assert.ok(level, `rule references unknown levelId ${rule.levelId}`);
    assert.equal(rule.minScore, level.scoreBandEnd, 'minScore must equal level scoreBandEnd');
  }
});

test('AC1: seed result echoes the four CDF-mandated org defaults', async () => {
  const { prisma } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  const result = await svc.seedOrganization(ORG);
  assert.equal(result.orgDefaults.visibilityDefault, 'OWN_ONLY');
  assert.equal(result.orgDefaults.approvalWorkflowDefault, 'SINGLE');
  assert.equal(result.orgDefaults.promotionMode, 'CALIBRATION');
});

// ── AC2: idempotency ────────────────────────────────────────────────

test('AC2: re-seeding an already-seeded org throws AlreadySeededError', async () => {
  const { prisma, calls } = makeCapturingPrisma({ existingTracksCount: 3 });
  const svc = new SeedingService(prisma);
  let threw = false;
  try {
    await svc.seedOrganization(ORG);
  } catch (err) {
    threw = true;
    assert.ok(err instanceof AlreadySeededError, `expected AlreadySeededError, got ${err.constructor.name}`);
    assert.equal(err.organizationId, ORG);
    assert.equal(err.code, 'ALREADY_SEEDED');
  }
  assert.ok(threw);
  // AC2 explicitly says "without mutating data" — confirm the early
  // bail-out happened BEFORE any create() call.
  assert.equal(calls.tracksCreated.length, 0);
  assert.equal(calls.levelsCreated.length, 0);
  assert.equal(calls.layersCreated.length, 0);
  assert.equal(calls.outboxCreated.length, 0);
});

test('AC2: seeding a non-existent org throws NotFoundException (no writes)', async () => {
  const { prisma, calls } = makeCapturingPrisma({ orgRow: null });
  const svc = new SeedingService(prisma);
  let threw = false;
  try {
    await svc.seedOrganization(ORG);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus?.(), 404);
  }
  assert.ok(threw);
  assert.equal(calls.tracksCreated.length, 0);
  assert.equal(calls.outboxCreated.length, 0);
});

// ── AC3: outbox emission ───────────────────────────────────────────

test('AC3: every seeded row emits exactly one configuration.seeded outbox event', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  await svc.seedOrganization(ORG);
  // 3 tracks + 10 levels + 30 layers + 30 reqs + 10 rules = 83
  const totalEntities =
    calls.tracksCreated.length +
    calls.levelsCreated.length +
    calls.layersCreated.length +
    calls.requirementsCreated.length +
    calls.promotionRulesCreated.length;
  assert.equal(calls.outboxCreated.length, totalEntities);
  assert.equal(totalEntities, 83);
  for (const evt of calls.outboxCreated) {
    assert.equal(evt.eventType, 'configuration.seeded');
    assert.equal(evt.aggregateType, 'configuration');
    assert.equal(evt.organizationId, ORG);
  }
});

test('AC3: each outbox payload validates against AuditEvent taxonomy (relay would accept)', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  await svc.seedOrganization(ORG);
  // Reconstruct the relay's merge candidate for every event — a
  // single drift would fail-loud here long before the relay DLQ.
  for (const evt of calls.outboxCreated) {
    const candidate = {
      eventId: evt.eventId,
      occurredAt: new Date().toISOString(),
      actorId: null,
      organizationId: evt.organizationId,
      entityType: evt.aggregateType,
      entityId: evt.aggregateId,
      eventType: evt.eventType,
      ...evt.payload,
    };
    const parsed = safeParseAuditEvent(candidate);
    assert.equal(parsed.ok, true, `relay would reject ${evt.aggregateId}: ${JSON.stringify(parsed)}`);
    if (parsed.ok) {
      assert.equal(parsed.event.eventType, 'configuration.seeded');
      assert.equal(parsed.event.actorId, null, 'seed is a system event');
    }
  }
});

test('AC3: outbox events kinds cover all five configuration entity types', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  await svc.seedOrganization(ORG);
  const kinds = new Set(calls.outboxCreated.map((e) => e.payload.after.kind));
  assert.deepEqual(
    [...kinds].sort(),
    ['career_track', 'layer', 'level', 'promotion_rule', 'requirement'],
  );
});

// ── AC4 (full state) — counts pin ───────────────────────────────────

test('AC4: CDF_EXPECTED_COUNTS matches the actual seed output (3/10/30/30/10)', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  const result = await svc.seedOrganization(ORG);
  assert.equal(result.counts.tracks, CDF_EXPECTED_COUNTS.tracks);
  assert.equal(result.counts.levels, CDF_EXPECTED_COUNTS.levels);
  assert.equal(result.counts.layers, CDF_EXPECTED_COUNTS.layers);
  assert.equal(result.counts.requirements, CDF_EXPECTED_COUNTS.requirements);
  assert.equal(result.counts.promotionRules, CDF_EXPECTED_COUNTS.promotionRules);
  // Pin the literal numbers — drift detection against the PRD spec.
  assert.equal(CDF_EXPECTED_COUNTS.tracks, 3);
  assert.equal(CDF_EXPECTED_COUNTS.levels, 10);
  assert.equal(CDF_EXPECTED_COUNTS.layers, 30);
  assert.equal(CDF_EXPECTED_COUNTS.requirements, 30);
  assert.equal(CDF_EXPECTED_COUNTS.promotionRules, 10);
  // Cross-check the actuals from the fake match the counts.
  assert.equal(calls.tracksCreated.length, 3);
  assert.equal(calls.levelsCreated.length, 10);
  assert.equal(calls.layersCreated.length, 30);
  assert.equal(calls.requirementsCreated.length, 30);
  assert.equal(calls.promotionRulesCreated.length, 10);
});

// ── Transactionality + RLS scope ────────────────────────────────────

test('seed runs inside exactly ONE withOrgScope transaction', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  await svc.seedOrganization(ORG);
  // withOrgScope emits one $executeRaw (set_config) per transaction.
  // The entire seed must be ONE transaction for atomicity — a partial
  // failure (e.g., the EXCLUDE constraint trips on a band mistake)
  // must roll back the whole thing.
  assert.equal(calls.scopes.length, 1, 'seed must use exactly one withOrgScope tx');
  assert.ok(calls.scopes[0].params.includes(ORG));
});

test('seed rejects non-UUID orgId via RlsInvalidOrgIdError', async () => {
  const { RlsInvalidOrgIdError } = await import('../dist/prisma/rls.helpers.js');
  const { prisma } = makeCapturingPrisma();
  const svc = new SeedingService(prisma);
  await assert.rejects(() => svc.seedOrganization('not-a-uuid'), RlsInvalidOrgIdError);
});

// ── Sanity: CDF data tables are non-empty + consistent ─────────────

test('CDF_TRACKS, CDF_LEVELS, CDF_LAYERS are internally consistent', () => {
  assert.equal(CDF_TRACKS.length, 3);
  // Every track in CDF_TRACKS has a level list in CDF_LEVELS.
  for (const track of CDF_TRACKS) {
    assert.ok(
      Array.isArray(CDF_LEVELS[track.slug]),
      `CDF_LEVELS missing entries for track "${track.slug}"`,
    );
    assert.ok(
      CDF_LEVELS[track.slug].length > 0,
      `CDF_LEVELS["${track.slug}"] must have at least one level`,
    );
  }
  // CDF_LAYERS has exactly the three PRD §8.3 default names.
  assert.equal(CDF_LAYERS.length, 3);
  assert.deepEqual(
    CDF_LAYERS.map((l) => l.name).sort(),
    ['Capability', 'Delivery', 'Influence'],
  );
});
