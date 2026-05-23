// Story 8-3 AC1 + AC2 + AC3 + AC4 — EvidenceDownloadService:
//   AC1: presigned GET URL with 10-min TTL; else 403
//   AC2: owner / direct manager / ADMIN allowed; everyone else 403
//   AC3: cross-org access surfaces as 404 (RLS misses) — proxied here
//        via a row-not-found result from the in-memory fake
//   AC4: each successful retrieval emits an `evidence.retrieved`
//        outbox row, validated against the @fcm/domain-contracts shape

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { EvidenceDownloadService } = await import('../dist/evidence/evidence-download.service.js');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG = '11111111-1111-4111-8111-111111111111';
const OWNER_USER = '22222222-2222-4222-8222-222222222222';
const MANAGER_USER = '33333333-3333-4333-8333-333333333333';
const STRANGER_USER = '44444444-4444-4444-8444-444444444444';
const ADMIN_USER = '55555555-5555-4555-8555-555555555555';

const OWNER_EMP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MANAGER_EMP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STRANGER_EMP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const EV = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REQ = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const KEY = `org/${ORG}/evidence/${OWNER_EMP}/${EV}/r.pdf`;

const actor = (overrides = {}) => ({
  user_id: OWNER_USER,
  organization_id: ORG,
  role: 'EMPLOYEE',
  display_name: 'Owner',
  ...overrides,
});

function makeConfig({ ttl = 600 } = {}) {
  return {
    get: (k) => (k === 'EVIDENCE_DOWNLOAD_TTL_SECONDS' ? ttl : undefined),
  };
}

function makeStorage({ expiresAt = new Date('2026-06-01T00:10:00Z') } = {}) {
  const calls = { presignGet: [] };
  return {
    calls,
    async presignPut() {
      throw new Error('not expected');
    },
    async head() {
      throw new Error('not expected');
    },
    async presignGet(args) {
      calls.presignGet.push(args);
      return { url: 'https://s3.fake/download', expiresAt };
    },
  };
}

function makePrisma({
  evidence = {
    id: EV,
    employeeId: OWNER_EMP,
    requirementId: REQ,
    state: 'APPROVED',
    storageObjectKey: KEY,
  },
  ownerEmployee = { userId: OWNER_USER },
  actorEmployee = { id: OWNER_EMP },
  assignments = [],
} = {}) {
  const calls = { tx: 0, outboxCreate: [] };
  const tx = {
    evidence: {
      findUnique: async ({ where }) => (evidence && where.id === evidence.id ? evidence : null),
    },
    employee: {
      findUnique: async ({ where }) => (ownerEmployee && where.id === evidence?.employeeId ? ownerEmployee : null),
      findFirst: async () => actorEmployee,
    },
    employeeAssignment: {
      findMany: async () => assignments,
    },
    outboxEvent: {
      create: async ({ data }) => {
        calls.outboxCreate.push(data);
        return data;
      },
    },
    $executeRaw: async () => 0,
  };
  const prisma = {
    $transaction: async (fn) => {
      calls.tx += 1;
      return await fn(tx);
    },
  };
  return { prisma, calls };
}

// ── AC1: happy path ────────────────────────────────────────────────

test('AC1: owner gets 10-min presigned GET URL with expiresAt', async () => {
  const { prisma, calls } = makePrisma();
  const storage = makeStorage();
  const svc = new EvidenceDownloadService(prisma, storage, makeConfig());
  const result = await svc.createDownloadUrl(actor(), EV);
  assert.equal(result.downloadUrl, 'https://s3.fake/download');
  assert.ok(result.expiresAt);
  assert.equal(storage.calls.presignGet.length, 1);
  assert.equal(storage.calls.presignGet[0].key, KEY);
  assert.equal(storage.calls.presignGet[0].ttlSeconds, 600);
  assert.equal(calls.tx, 1);
});

// ── AC2: authorization matrix ──────────────────────────────────────

test('AC2: ADMIN downloads anyone (via=ADMIN, no employee row required)', async () => {
  const { prisma } = makePrisma({
    ownerEmployee: { userId: OWNER_USER },
    actorEmployee: null,
  });
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  const result = await svc.createDownloadUrl(
    actor({ user_id: ADMIN_USER, role: 'ADMIN' }),
    EV,
  );
  assert.ok(result.downloadUrl);
});

test('AC2: direct manager downloads team-member evidence', async () => {
  const { prisma } = makePrisma({
    ownerEmployee: { userId: OWNER_USER },
    actorEmployee: { id: MANAGER_EMP },
    assignments: [{ managerEmployeeId: MANAGER_EMP, deactivatedAt: null }],
  });
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  const result = await svc.createDownloadUrl(
    actor({ user_id: MANAGER_USER, role: 'MANAGER' }),
    EV,
  );
  assert.ok(result.downloadUrl);
});

test('AC2: unrelated EMPLOYEE gets 403', async () => {
  const { prisma } = makePrisma({
    ownerEmployee: { userId: OWNER_USER },
    actorEmployee: { id: STRANGER_EMP },
    assignments: [{ managerEmployeeId: MANAGER_EMP, deactivatedAt: null }],
  });
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createDownloadUrl(actor({ user_id: STRANGER_USER, role: 'EMPLOYEE' }), EV);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 403);
  }
  assert.ok(threw);
});

test('AC2: a deactivated former manager gets 403 (assignment closed)', async () => {
  const { prisma } = makePrisma({
    ownerEmployee: { userId: OWNER_USER },
    actorEmployee: { id: MANAGER_EMP },
    assignments: [{ managerEmployeeId: MANAGER_EMP, deactivatedAt: new Date() }],
  });
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createDownloadUrl(actor({ user_id: MANAGER_USER, role: 'MANAGER' }), EV);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 403);
  }
  assert.ok(threw);
});

// ── AC3: cross-org row not visible (RLS would miss) → 404 ──────────

test('AC3: evidenceId not visible in actor org returns 404 (RLS miss → row not found)', async () => {
  // The in-memory fake mimics RLS by returning null when the actor's
  // org doesn't match. We exercise the controller's "row not found"
  // path explicitly so the not-found surface is pinned.
  const { prisma } = makePrisma({ evidence: null });
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createDownloadUrl(actor(), EV);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw);
});

// ── State / payload gating ─────────────────────────────────────────

test('PENDING_APPROVAL is downloadable (reviewer needs bytes to decide)', async () => {
  const { prisma } = makePrisma({
    evidence: {
      id: EV,
      employeeId: OWNER_EMP,
      requirementId: REQ,
      state: 'PENDING_APPROVAL',
      storageObjectKey: KEY,
    },
  });
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  const result = await svc.createDownloadUrl(actor(), EV);
  assert.ok(result.downloadUrl);
});

test('REJECTED is downloadable (audit / appeal context — bytes still in S3 until GC)', async () => {
  const { prisma } = makePrisma({
    evidence: {
      id: EV,
      employeeId: OWNER_EMP,
      requirementId: REQ,
      state: 'REJECTED',
      storageObjectKey: KEY,
    },
  });
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  const result = await svc.createDownloadUrl(actor(), EV);
  assert.ok(result.downloadUrl);
});

test('rejects DRAFT row with 400 invalid_state (bytes may not exist)', async () => {
  const { prisma } = makePrisma({
    evidence: { id: EV, employeeId: OWNER_EMP, requirementId: REQ, state: 'DRAFT', storageObjectKey: KEY },
  });
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createDownloadUrl(actor(), EV);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
    assert.equal(err.getResponse()?.error, 'invalid_state');
  }
  assert.ok(threw);
});

test('rejects EXPIRED row with 400 expired', async () => {
  const { prisma } = makePrisma({
    evidence: { id: EV, employeeId: OWNER_EMP, requirementId: REQ, state: 'EXPIRED', storageObjectKey: KEY },
  });
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createDownloadUrl(actor(), EV);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
    assert.equal(err.getResponse()?.error, 'expired');
  }
  assert.ok(threw);
});

test('rejects row without storage_object_key (text/url evidence) with 400 no_object', async () => {
  const { prisma } = makePrisma({
    evidence: { id: EV, employeeId: OWNER_EMP, requirementId: REQ, state: 'APPROVED', storageObjectKey: null },
  });
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createDownloadUrl(actor(), EV);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
    assert.equal(err.getResponse()?.error, 'no_object');
  }
  assert.ok(threw);
});

test('rejects malformed evidenceId with 400', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createDownloadUrl(actor(), 'not-a-uuid');
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threw);
});

// ── AC4: audit emission ────────────────────────────────────────────

test('AC4: each successful download emits one evidence.retrieved outbox row', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  await svc.createDownloadUrl(actor(), EV);
  assert.equal(calls.outboxCreate.length, 1);
  const row = calls.outboxCreate[0];
  assert.equal(row.eventType, 'evidence.retrieved');
  assert.equal(row.aggregateType, 'evidence');
  assert.equal(row.aggregateId, EV);
  assert.equal(row.organizationId, ORG);
  assert.equal(row.payload.before.evidenceId, EV);
  assert.equal(row.payload.before.employeeId, OWNER_EMP);
  assert.equal(row.payload.before.requirementId, REQ);
  assert.equal(row.payload.after, null);
});

test('AC4: outbox payload validates against AuditEvent taxonomy (relay would accept)', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  await svc.createDownloadUrl(actor(), EV);
  const out = calls.outboxCreate[0];
  const audited = {
    eventType: out.eventType,
    entityType: 'evidence',
    eventId: out.eventId,
    occurredAt: new Date().toISOString(),
    actorId: out.payload.actorId,
    organizationId: out.organizationId,
    entityId: out.aggregateId,
    reason: out.payload.reason,
    before: out.payload.before,
    after: out.payload.after,
  };
  const parsed = safeParseAuditEvent(audited);
  assert.ok(parsed.ok, `relay would reject: ${parsed.ok ? '' : JSON.stringify(parsed.error?.issues)}`);
});

test('AC4: a denied request does NOT emit an audit event', async () => {
  const { prisma, calls } = makePrisma({
    actorEmployee: { id: STRANGER_EMP },
    assignments: [],
  });
  const svc = new EvidenceDownloadService(prisma, makeStorage(), makeConfig());
  try {
    await svc.createDownloadUrl(actor({ user_id: STRANGER_USER }), EV);
  } catch {
    // expected
  }
  assert.equal(calls.outboxCreate.length, 0);
});

// ── Storage unavailable ────────────────────────────────────────────

test('rejects with 503 when storage is not configured', async () => {
  const { prisma } = makePrisma();
  const storage = {
    async presignGet() {
      const { EvidenceStorageNotConfiguredError } = await import(
        '../dist/evidence/aws-s3-evidence-storage.js'
      );
      throw new EvidenceStorageNotConfiguredError('bucket missing');
    },
    async presignPut() {},
    async head() {},
  };
  const svc = new EvidenceDownloadService(prisma, storage, makeConfig());
  let threw = false;
  try {
    await svc.createDownloadUrl(actor(), EV);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 503);
  }
  assert.ok(threw);
});
