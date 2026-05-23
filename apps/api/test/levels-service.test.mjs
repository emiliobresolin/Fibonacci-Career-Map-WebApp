// Story 7-2 — LevelsService: validation, soft-deactivation, audit
// emission, and band-overlap 409 translation.
//
// AC coverage:
//   AC1 — ADMIN-only on writes is asserted at the controller layer
//         (levels-controller-wiring.test.mjs); this file exercises the
//         service contract directly, including the "unknown trackId
//         ⇒ 404" branch.
//   AC2 — band-overlap: an exclusion-constraint violation surfaces as a
//         structured 409 LEVEL_BAND_OVERLAP with conflicting_level_id
//         and conflicting_band.
//   AC3 — soft-deactivation: deactivate() flips active=false;
//         idempotent against an already-inactive row.
//   AC4 — every mutation emits one configuration.changed outbox event
//         co-committed with the row write, payload validates against
//         the AuditEvent taxonomy.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { LevelsService } = await import('../dist/configuration/levels.service.js');
const { Prisma } = await import('@prisma/client');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRACK_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LEVEL_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PEER_LEVEL_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ACTOR = {
  user_id: ADMIN_ID,
  organization_id: ORG_ID,
  role: 'ADMIN',
  display_name: 'Admin',
};

function makeFake({
  existingLevel = null,
  trackExists = true,
  throwOnLevelCreate = null,
  throwOnLevelUpdate = null,
  overlapPeer = null,
} = {}) {
  let state = existingLevel ? { ...existingLevel } : null;
  const calls = {
    levelCreate: [],
    levelUpdate: [],
    levelFindUnique: [],
    outboxCreate: [],
    txCount: 0,
    queryRaw: [],
  };
  const tx = {
    level: {
      create: async (args) => {
        calls.levelCreate.push(args);
        if (throwOnLevelCreate) throw throwOnLevelCreate;
        const now = new Date();
        state = {
          id: LEVEL_ID,
          organizationId: args.data.organizationId,
          careerTrackId: args.data.careerTrackId,
          levelCode: args.data.levelCode,
          name: args.data.name,
          scoreBandStart: args.data.scoreBandStart,
          scoreBandEnd: args.data.scoreBandEnd,
          displayOrder: args.data.displayOrder ?? 0,
          active: args.data.active ?? true,
          createdAt: now,
          updatedAt: now,
        };
        return state;
      },
      findUnique: async (args) => {
        calls.levelFindUnique.push(args);
        return state;
      },
      update: async (args) => {
        calls.levelUpdate.push(args);
        if (throwOnLevelUpdate) throw throwOnLevelUpdate;
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
    $queryRaw: async (template, ...args) => {
      calls.queryRaw.push([template, ...args]);
      const sql = Array.isArray(template?.strings) ? template.strings.join('?') : String(template);
      // Story 7-9: resolveAffectedEmployeeIds also issues $queryRaw.
      // Distinguish by SQL content — the overlap-lookup query selects
      // from "levels", the affected-employees query from "employees".
      if (/FROM\s+employees/i.test(sql)) return [];
      return overlapPeer === null ? [] : [overlapPeer];
    },
  };
  const prisma = {
    $transaction: async (fn) => {
      calls.txCount += 1;
      return await fn(tx);
    },
  };
  const repo = {
    listByTrack: async () => (state ? [state] : []),
    findById: async () => state,
  };
  const tracksRepo = {
    findById: async () => (trackExists ? { id: TRACK_ID, organizationId: ORG_ID } : null),
  };
  return { prisma, repo, tracksRepo, calls };
}

// ── AC1: unknown trackId → 404 ──────────────────────────────────────

test('AC1: create() with unknown trackId throws 404', async () => {
  const { prisma, repo, tracksRepo } = makeFake({ trackExists: false });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  let threw = false;
  try {
    await svc.create(
      ORG_ID,
      TRACK_ID,
      { levelCode: 'L1', name: 'Level 1', scoreBandStart: 0, scoreBandEnd: 100 },
      ACTOR,
    );
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw, 'create() under unknown track must 404');
});

test('AC1: list() under unknown trackId throws 404', async () => {
  const { prisma, repo, tracksRepo } = makeFake({ trackExists: false });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  let threw = false;
  try {
    await svc.listByTrack(ORG_ID, TRACK_ID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw);
});

// ── AC4: create() emits configuration.changed in same tx ────────────

test('AC4: create() emits one configuration.changed outbox event in same tx', async () => {
  const { prisma, repo, tracksRepo, calls } = makeFake();
  const svc = new LevelsService(prisma, repo, tracksRepo);
  const row = await svc.create(
    ORG_ID,
    TRACK_ID,
    { levelCode: 'L1', name: 'Level 1', scoreBandStart: 0, scoreBandEnd: 100 },
    ACTOR,
  );

  assert.equal(row.levelCode, 'L1');
  assert.equal(calls.levelCreate.length, 1);
  assert.equal(calls.outboxCreate.length, 1, 'AC4: one audit event per create');
  assert.equal(calls.txCount, 1, 'AC4: write + audit emit must be in one transaction');

  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'configuration.changed');
  assert.equal(outbox.aggregateType, 'configuration');
  assert.equal(outbox.aggregateId, LEVEL_ID);
  assert.equal(outbox.payload.actorId, ADMIN_ID);
  assert.equal(outbox.payload.before.beforeValue, null, 'CREATE has null beforeValue');
  assert.equal(outbox.payload.before.configEntityType, 'level');
  assert.equal(outbox.payload.before.field, '*');
  assert.ok(outbox.payload.after.afterValue, 'CREATE has full row in afterValue');
  assert.equal(outbox.payload.after.afterValue.levelCode, 'L1');
  assert.equal(outbox.payload.after.afterValue.scoreBandStart, 0);
  assert.equal(outbox.payload.after.afterValue.scoreBandEnd, 100);
});

test('AC4: create() outbox payload validates against AuditEvent taxonomy', async () => {
  const { prisma, repo, tracksRepo, calls } = makeFake();
  const svc = new LevelsService(prisma, repo, tracksRepo);
  await svc.create(
    ORG_ID,
    TRACK_ID,
    { levelCode: 'L1', name: 'Level 1', scoreBandStart: 0, scoreBandEnd: 100 },
    ACTOR,
  );
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

// ── AC4: update() with before/after row state ───────────────────────

test('AC4: update() emits configuration.changed with before/after row state', async () => {
  const existing = {
    id: LEVEL_ID,
    organizationId: ORG_ID,
    careerTrackId: TRACK_ID,
    levelCode: 'L1',
    name: 'Level 1',
    scoreBandStart: 0,
    scoreBandEnd: 100,
    displayOrder: 0,
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const { prisma, repo, tracksRepo, calls } = makeFake({ existingLevel: existing });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  await svc.update(ORG_ID, LEVEL_ID, { name: 'Engineer I' }, ACTOR);

  assert.equal(calls.levelUpdate.length, 1);
  assert.equal(calls.outboxCreate.length, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.payload.before.beforeValue.name, 'Level 1');
  assert.equal(outbox.payload.after.afterValue.name, 'Engineer I');
});

test('update() with empty patch is a no-op (no audit emit, no DB write)', async () => {
  const existing = {
    id: LEVEL_ID,
    organizationId: ORG_ID,
    careerTrackId: TRACK_ID,
    levelCode: 'L1',
    name: 'Level 1',
    scoreBandStart: 0,
    scoreBandEnd: 100,
    displayOrder: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, tracksRepo, calls } = makeFake({ existingLevel: existing });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  const result = await svc.update(ORG_ID, LEVEL_ID, {}, ACTOR);
  assert.equal(result.id, LEVEL_ID);
  assert.equal(calls.levelUpdate.length, 0, 'empty patch must not write');
  assert.equal(calls.outboxCreate.length, 0, 'empty patch must not emit audit');
});

test('update() recomputes band from partial input merged with current row', async () => {
  // Only scoreBandStart provided; service must combine with stored end
  // to validate `end > start`.
  const existing = {
    id: LEVEL_ID,
    organizationId: ORG_ID,
    careerTrackId: TRACK_ID,
    levelCode: 'L1',
    name: 'Level 1',
    scoreBandStart: 0,
    scoreBandEnd: 100,
    displayOrder: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, tracksRepo, calls } = makeFake({ existingLevel: existing });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  await svc.update(ORG_ID, LEVEL_ID, { scoreBandStart: 10 }, ACTOR);
  assert.equal(calls.levelUpdate.length, 1);
  assert.equal(calls.levelUpdate[0].data.scoreBandStart, 10);
  assert.equal(calls.levelUpdate[0].data.scoreBandEnd, 100, 'unchanged end carried into patch');
});

test('update() rejects band shift that would make end <= start (validated against merged values)', async () => {
  const existing = {
    id: LEVEL_ID,
    organizationId: ORG_ID,
    careerTrackId: TRACK_ID,
    levelCode: 'L1',
    name: 'Level 1',
    scoreBandStart: 0,
    scoreBandEnd: 100,
    displayOrder: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, tracksRepo } = makeFake({ existingLevel: existing });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  let threw = false;
  try {
    await svc.update(ORG_ID, LEVEL_ID, { scoreBandStart: 200 }, ACTOR);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threw, 'shifting start past end must 400');
});

// ── AC3: deactivate is soft + idempotent ────────────────────────────

test('AC3: deactivate() sets active=false and emits one audit event', async () => {
  const existing = {
    id: LEVEL_ID,
    organizationId: ORG_ID,
    careerTrackId: TRACK_ID,
    levelCode: 'L1',
    name: 'Level 1',
    scoreBandStart: 0,
    scoreBandEnd: 100,
    displayOrder: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, tracksRepo, calls } = makeFake({ existingLevel: existing });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  const result = await svc.deactivate(ORG_ID, LEVEL_ID, ACTOR);
  assert.equal(result.active, false, 'AC3: soft-delete via active flag');
  assert.equal(calls.levelUpdate.length, 1);
  assert.equal(calls.outboxCreate.length, 1);
  assert.deepEqual(calls.levelUpdate[0].data, { active: false });
});

test('AC3: deactivate() on already-inactive level is a no-op (no audit emit)', async () => {
  const existing = {
    id: LEVEL_ID,
    organizationId: ORG_ID,
    careerTrackId: TRACK_ID,
    levelCode: 'L1',
    name: 'Level 1',
    scoreBandStart: 0,
    scoreBandEnd: 100,
    displayOrder: 0,
    active: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { prisma, repo, tracksRepo, calls } = makeFake({ existingLevel: existing });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  await svc.deactivate(ORG_ID, LEVEL_ID, ACTOR);
  assert.equal(calls.levelUpdate.length, 0);
  assert.equal(calls.outboxCreate.length, 0, 'idempotent: no duplicate audit on no-op');
});

// ── Unique levelCode (P2002) → 409 ──────────────────────────────────

test('P2002 on levelCode collision surfaces as 409 Conflict', async () => {
  const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['career_track_id', 'level_code'] },
  });
  const { prisma, repo, tracksRepo } = makeFake({ throwOnLevelCreate: p2002 });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  let threw = false;
  try {
    await svc.create(
      ORG_ID,
      TRACK_ID,
      { levelCode: 'L1', name: 'Level 1', scoreBandStart: 0, scoreBandEnd: 100 },
      ACTOR,
    );
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
    assert.match(err.message ?? '', /already exists/i);
  }
  assert.ok(threw, 'levelCode collision must surface as 409');
});

// ── AC2: band overlap → structured 409 LEVEL_BAND_OVERLAP ───────────

test('AC2: PrismaClientUnknownRequestError with constraint name in message surfaces as 409 LEVEL_BAND_OVERLAP with peer id', async () => {
  // Prisma can surface EXCLUDE failures either as KnownRequestError
  // (P2010 + meta) or as UnknownRequestError (message only); we exercise
  // the latter here, the former in the next test.
  const violation = new Prisma.PrismaClientUnknownRequestError(
    'ERROR: conflicting key value violates exclusion constraint "levels_band_non_overlap"',
    { clientVersion: 'test' },
  );
  const peer = {
    id: PEER_LEVEL_ID,
    score_band_start: 50,
    score_band_end: 150,
  };
  const { prisma, repo, tracksRepo } = makeFake({
    throwOnLevelCreate: violation,
    overlapPeer: peer,
  });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  let threw = false;
  try {
    await svc.create(
      ORG_ID,
      TRACK_ID,
      { levelCode: 'L2', name: 'Level 2', scoreBandStart: 100, scoreBandEnd: 200 },
      ACTOR,
    );
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409, 'overlap must surface as 409');
    const body = err.getResponse();
    assert.equal(body.error, 'level_band_overlap');
    assert.equal(body.conflicting_level_id, PEER_LEVEL_ID);
    assert.deepEqual(body.conflicting_band, { start: 50, end: 150 });
  }
  assert.ok(threw, 'overlapping create must throw');
});

test('AC2: exclusion-constraint violation falls back to conflicting_level_id: null when peer lookup is empty', async () => {
  // Concurrency case: the peer that triggered the violation was
  // deactivated between the failed write and the enrichment query.
  const violation = new Prisma.PrismaClientUnknownRequestError(
    'ERROR: conflicting key value violates exclusion constraint "levels_band_non_overlap"',
    { clientVersion: 'test' },
  );
  const { prisma, repo, tracksRepo } = makeFake({
    throwOnLevelCreate: violation,
    overlapPeer: null, // queryRaw returns []
  });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  let threw = false;
  try {
    await svc.create(
      ORG_ID,
      TRACK_ID,
      { levelCode: 'L2', name: 'Level 2', scoreBandStart: 100, scoreBandEnd: 200 },
      ACTOR,
    );
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
    const body = err.getResponse();
    assert.equal(body.error, 'level_band_overlap');
    assert.equal(body.conflicting_level_id, null);
    assert.deepEqual(body.conflicting_band, { start: 100, end: 200 });
  }
  assert.ok(threw);
});

test('AC2: PrismaClientKnownRequestError P2010 with constraint in message is also translated', async () => {
  const violation = new Prisma.PrismaClientKnownRequestError(
    'Raw query failed: ERROR: conflicting key value violates exclusion constraint "levels_band_non_overlap"',
    { code: 'P2010', clientVersion: 'test', meta: {} },
  );
  const peer = { id: PEER_LEVEL_ID, score_band_start: 0, score_band_end: 99 };
  const { prisma, repo, tracksRepo } = makeFake({
    throwOnLevelCreate: violation,
    overlapPeer: peer,
  });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  let threw = false;
  try {
    await svc.create(
      ORG_ID,
      TRACK_ID,
      { levelCode: 'L1', name: 'Level 1', scoreBandStart: 0, scoreBandEnd: 99 },
      ACTOR,
    );
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
    assert.equal(err.getResponse().error, 'level_band_overlap');
  }
  assert.ok(threw);
});

test('AC2 hardening: plain Error whose message accidentally mentions the constraint is NOT mistranslated as 409', async () => {
  // Defense against the reviewer's H3: a non-Prisma Error whose message
  // happens to contain "levels_band_non_overlap" (e.g. an internal log
  // wrapper or unrelated bug) must propagate as-is, not get translated
  // into a misleading 409. Prevents future bugs from being silently
  // re-typed as user-facing conflicts.
  const unrelated = new Error('unrelated bug; somehow mentions levels_band_non_overlap');
  const { prisma, repo, tracksRepo } = makeFake({ throwOnLevelCreate: unrelated });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  let caught = null;
  try {
    await svc.create(
      ORG_ID,
      TRACK_ID,
      { levelCode: 'L1', name: 'Level 1', scoreBandStart: 0, scoreBandEnd: 100 },
      ACTOR,
    );
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'plain Error must still propagate');
  assert.equal(caught.constructor.name, 'Error', 'plain Error must NOT be reshaped into ConflictException');
  assert.match(caught.message, /unrelated bug/);
});

test('AC2 hardening: update() without band changes does NOT fabricate a {0,0} 409 if a violation somehow fires', async () => {
  // Defense against the reviewer's B2: if a level update that did not
  // touch scoreBandStart/scoreBandEnd ever hits an exclusion violation
  // (unreachable today, but reachable in future if an `active`-toggle
  // endpoint lands), we rethrow as-is rather than report a fake band.
  const existing = {
    id: LEVEL_ID,
    organizationId: ORG_ID,
    careerTrackId: TRACK_ID,
    levelCode: 'L1',
    name: 'Level 1',
    scoreBandStart: 0,
    scoreBandEnd: 100,
    displayOrder: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const violation = new Prisma.PrismaClientUnknownRequestError(
    'ERROR: conflicting key value violates exclusion constraint "levels_band_non_overlap"',
    { clientVersion: 'test' },
  );
  const { prisma, repo, tracksRepo } = makeFake({
    existingLevel: existing,
    throwOnLevelUpdate: violation,
  });
  const svc = new LevelsService(prisma, repo, tracksRepo);
  let caught = null;
  try {
    // Patch only the name — not the band.
    await svc.update(ORG_ID, LEVEL_ID, { name: 'Engineer I' }, ACTOR);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'update must propagate the unexpected violation');
  // Must NOT be reshaped into a 409 with fake band coordinates.
  assert.notEqual(
    typeof caught.getStatus === 'function' ? caught.getStatus() : null,
    409,
    'name-only update must not get reshaped into a fake band-overlap 409',
  );
});

// ── Validation ──────────────────────────────────────────────────────

test('validates levelCode shape (rejects bad start/end chars, length, special chars)', async () => {
  const { prisma, repo, tracksRepo } = makeFake();
  const svc = new LevelsService(prisma, repo, tracksRepo);
  // Reject: empty, leading non-alphanumeric, trailing non-alphanumeric,
  // special chars, overly long.
  for (const bad of ['', '-L1', '_L1', '!', 'L1-', 'L1_', 'A'.repeat(33)]) {
    let threw = false;
    try {
      await svc.create(
        ORG_ID,
        TRACK_ID,
        { levelCode: bad, name: 'X', scoreBandStart: 0, scoreBandEnd: 100 },
        ACTOR,
      );
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400, `bad levelCode "${bad}" should be 400`);
    }
    assert.ok(threw, `expected rejection for levelCode "${bad}"`);
  }
});

test('accepts levelCode shapes that orgs actually use', async () => {
  // Single-letter codes (M for Manager), digit-led (3), mixed-case
  // (Staff, Sr-Eng), embedded hyphen/underscore.
  const { prisma, repo, tracksRepo, calls } = makeFake();
  const svc = new LevelsService(prisma, repo, tracksRepo);
  for (const ok of ['L1', 'L2', 'M', 'Staff', 'Senior', 'Sr-Eng', 'L_1', '3']) {
    const before = calls.levelCreate.length;
    await svc.create(
      ORG_ID,
      TRACK_ID,
      { levelCode: ok, name: 'X', scoreBandStart: before * 100, scoreBandEnd: before * 100 + 50 },
      ACTOR,
    );
    assert.equal(calls.levelCreate.length, before + 1, `levelCode "${ok}" should be accepted`);
  }
});

test('validates name (required, bounded)', async () => {
  const { prisma, repo, tracksRepo } = makeFake();
  const svc = new LevelsService(prisma, repo, tracksRepo);
  for (const bad of ['   ', 'x'.repeat(201)]) {
    let threw = false;
    try {
      await svc.create(
        ORG_ID,
        TRACK_ID,
        { levelCode: 'L1', name: bad, scoreBandStart: 0, scoreBandEnd: 100 },
        ACTOR,
      );
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400);
    }
    assert.ok(threw);
  }
});

test('validates band: start >= 0, end > start, both integers', async () => {
  const { prisma, repo, tracksRepo } = makeFake();
  const svc = new LevelsService(prisma, repo, tracksRepo);
  const bad = [
    { start: -1, end: 100 },
    { start: 100, end: 100 },
    { start: 100, end: 50 },
    { start: 0.5, end: 100 },
    { start: 0, end: 100.5 },
  ];
  for (const { start, end } of bad) {
    let threw = false;
    try {
      await svc.create(
        ORG_ID,
        TRACK_ID,
        { levelCode: 'L1', name: 'L1', scoreBandStart: start, scoreBandEnd: end },
        ACTOR,
      );
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400, `bad band [${start},${end}] should be 400`);
    }
    assert.ok(threw, `expected rejection for band [${start}, ${end}]`);
  }
});

test('findById throws 404 when not found', async () => {
  const { prisma, tracksRepo } = makeFake();
  const repo = { findById: async () => null };
  const svc = new LevelsService(prisma, repo, tracksRepo);
  let threw = false;
  try {
    await svc.findById(ORG_ID, LEVEL_ID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw);
});
