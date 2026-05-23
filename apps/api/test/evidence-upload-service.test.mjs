// Story 8-2 AC1: EvidenceUploadService — pre-signed URL slot creation.
// Validates: requirement type gating, employee resolution, key shape,
// content-length-range bounds, TTL plumbing, atomicity (one withOrgScope
// per call), and presigned URL plumbing into the response.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { EvidenceUploadService } = await import('../dist/evidence/evidence-upload.service.js');

const ORG = '11111111-1111-4111-8111-111111111111';
const ACTOR_USER = '22222222-2222-4222-8222-222222222222';
const EMP = '33333333-3333-4333-8333-333333333333';
const REQ = '44444444-4444-4444-8444-444444444444';

const ACTOR = {
  user_id: ACTOR_USER,
  organization_id: ORG,
  role: 'EMPLOYEE',
  display_name: 'Worker',
};

function makeConfig({ min = 1, max = 25 * 1024 * 1024, ttl = 900 } = {}) {
  return {
    get(key) {
      if (key === 'EVIDENCE_UPLOAD_MIN_BYTES') return min;
      if (key === 'EVIDENCE_UPLOAD_MAX_BYTES') return max;
      if (key === 'EVIDENCE_UPLOAD_SLOT_TTL_SECONDS') return ttl;
      return undefined;
    },
  };
}

function makeStorage({ url = 'https://s3.fake/upload', expiresAt = new Date('2026-06-01T00:00:00Z') } = {}) {
  const calls = [];
  return {
    calls,
    async presignPut(args) {
      calls.push(args);
      return { url, expiresAt };
    },
    async head() {
      throw new Error('head not expected in upload-slot');
    },
  };
}

function makePrisma({
  requirement = { id: REQ, organizationId: ORG, active: true, evidenceType: 'FILE' },
  employee = { id: EMP, userId: ACTOR_USER, organizationId: ORG, deactivatedAt: null },
} = {}) {
  const calls = { tx: 0, sql: [], evidenceCreate: [] };
  const tx = {
    requirement: {
      findUnique: async ({ where }) => (requirement && where.id === requirement.id ? requirement : null),
    },
    employee: {
      findFirst: async ({ where }) => {
        if (
          employee &&
          where.userId === employee.userId &&
          where.organizationId === employee.organizationId &&
          (where.deactivatedAt ?? null) === null
        ) {
          return employee;
        }
        return null;
      },
    },
    evidence: {
      create: async ({ data }) => {
        calls.evidenceCreate.push(data);
        return { ...data, createdAt: new Date(), updatedAt: new Date() };
      },
    },
    $executeRaw: async (template, ...params) => {
      calls.sql.push({ sql: String(template?.strings?.join?.('?') ?? template), params });
      return 0;
    },
  };
  const prisma = {
    $transaction: async (fn) => {
      calls.tx += 1;
      return await fn(tx);
    },
  };
  return { prisma, calls };
}

const VALID_INPUT = { contentType: 'application/pdf', contentLength: 1024, filename: 'r.pdf' };

// ── AC1: happy path produces 201 + canonical key + presigned URL ──

test('AC1: happy path creates DRAFT, returns presigned URL with canonical key shape', async () => {
  const { prisma, calls } = makePrisma();
  const storage = makeStorage();
  const svc = new EvidenceUploadService(prisma, storage, makeConfig());
  const result = await svc.createUploadSlot(ACTOR, REQ, VALID_INPUT);

  // Key shape (AC1): org/{org_id}/evidence/{employee_id}/{evidence_id}/{filename}
  assert.match(result.key, new RegExp(`^org/${ORG}/evidence/${EMP}/[0-9a-f-]+/r\\.pdf$`));
  assert.equal(result.uploadUrl, 'https://s3.fake/upload');
  assert.equal(result.contentLengthRange.min, 1);
  assert.equal(result.contentLengthRange.max, 25 * 1024 * 1024);
  // Exactly one withOrgScope tx ran (atomicity invariant).
  assert.equal(calls.tx, 1);
  // SET LOCAL app.current_org_id fired.
  assert.ok(calls.sql.length >= 1, 'expected at least one $executeRaw for SET LOCAL');
  // DRAFT row was created with the stored key.
  assert.equal(calls.evidenceCreate.length, 1);
  const row = calls.evidenceCreate[0];
  assert.equal(row.state, 'DRAFT');
  assert.equal(row.organizationId, ORG);
  assert.equal(row.employeeId, EMP);
  assert.equal(row.requirementId, REQ);
  assert.equal(row.storageObjectKey, result.key);
  // The DRAFT row pins the declared contentType + sizeBytes so
  // finalize can enforce the byte cap (presigned PUT does not SigV4-
  // sign Content-Length; AC1 enforcement happens at finalize).
  assert.equal(row.contentType, 'application/pdf');
  assert.equal(typeof row.sizeBytes, 'bigint');
  assert.equal(row.sizeBytes, 1024n);
  // presignPut was called with the expected pinning args.
  assert.equal(storage.calls.length, 1);
  assert.equal(storage.calls[0].contentType, 'application/pdf');
  assert.equal(storage.calls[0].contentLength, 1024);
  assert.equal(storage.calls[0].ttlSeconds, 900);
});

// ── AC1: 15-min TTL is the default ───────────────────────────────

test('AC1: presign request carries the 15-min default TTL', async () => {
  const { prisma } = makePrisma();
  const storage = makeStorage();
  const svc = new EvidenceUploadService(prisma, storage, makeConfig({ ttl: 900 }));
  await svc.createUploadSlot(ACTOR, REQ, VALID_INPUT);
  assert.equal(storage.calls[0].ttlSeconds, 900);
});

// ── AC1: content-length-range bounded ─────────────────────────────

test('AC1: content-length-range rejects contentLength > max', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceUploadService(prisma, makeStorage(), makeConfig({ max: 1000 }));
  let threw = false;
  try {
    await svc.createUploadSlot(ACTOR, REQ, { ...VALID_INPUT, contentLength: 1001 });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threw);
});

test('AC1: content-length-range rejects contentLength < min', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceUploadService(prisma, makeStorage(), makeConfig({ min: 100 }));
  let threw = false;
  try {
    await svc.createUploadSlot(ACTOR, REQ, { ...VALID_INPUT, contentLength: 50 });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threw);
});

test('AC1: content-length must be an integer', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceUploadService(prisma, makeStorage(), makeConfig());
  for (const bad of [-1, 1.5, NaN, '1024', null, undefined]) {
    let threw = false;
    try {
      await svc.createUploadSlot(ACTOR, REQ, { ...VALID_INPUT, contentLength: bad });
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400);
    }
    assert.ok(threw, `expected reject for contentLength=${bad}`);
  }
});

// ── Requirement gating ────────────────────────────────────────────

test('rejects requirementId that is not a UUID with 400', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceUploadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createUploadSlot(ACTOR, 'not-a-uuid', VALID_INPUT);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threw);
});

test('rejects unknown requirement with 404', async () => {
  const { prisma } = makePrisma({ requirement: null });
  const svc = new EvidenceUploadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createUploadSlot(ACTOR, REQ, VALID_INPUT);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw);
});

test('rejects deactivated requirement with 409', async () => {
  const { prisma } = makePrisma({
    requirement: { id: REQ, organizationId: ORG, active: false, evidenceType: 'FILE' },
  });
  const svc = new EvidenceUploadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createUploadSlot(ACTOR, REQ, VALID_INPUT);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
  }
  assert.ok(threw);
});

test('rejects TEXT-type requirement with 400 (this surface is FILE-only)', async () => {
  const { prisma } = makePrisma({
    requirement: { id: REQ, organizationId: ORG, active: true, evidenceType: 'TEXT' },
  });
  const svc = new EvidenceUploadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createUploadSlot(ACTOR, REQ, VALID_INPUT);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
    assert.match(err.message ?? '', /TEXT/);
  }
  assert.ok(threw);
});

test('rejects with 404 when actor has no active employee record in this org', async () => {
  const { prisma } = makePrisma({ employee: null });
  const svc = new EvidenceUploadService(prisma, makeStorage(), makeConfig());
  let threw = false;
  try {
    await svc.createUploadSlot(ACTOR, REQ, VALID_INPUT);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
    assert.match(err.message ?? '', /employee/);
  }
  assert.ok(threw);
});

// ── Filename validation ───────────────────────────────────────────

test('rejects path-traversal filename with 400', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceUploadService(prisma, makeStorage(), makeConfig());
  for (const bad of ['../escape.pdf', '/etc/passwd', '..', '.', '']) {
    let threw = false;
    try {
      await svc.createUploadSlot(ACTOR, REQ, { ...VALID_INPUT, filename: bad });
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400);
    }
    assert.ok(threw, `expected reject for filename=${JSON.stringify(bad)}`);
  }
});

// ── Storage-config failure ────────────────────────────────────────

test('rejects with 503 when storage is not configured', async () => {
  const { prisma } = makePrisma();
  const storage = {
    async presignPut() {
      const { EvidenceStorageNotConfiguredError } = await import(
        '../dist/evidence/aws-s3-evidence-storage.js'
      );
      throw new EvidenceStorageNotConfiguredError('bucket missing');
    },
    async head() {},
  };
  const svc = new EvidenceUploadService(prisma, storage, makeConfig());
  let threw = false;
  try {
    await svc.createUploadSlot(ACTOR, REQ, VALID_INPUT);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 503);
  }
  assert.ok(threw);
});

// ── Content-type validation ───────────────────────────────────────

test('rejects malformed contentType with 400', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceUploadService(prisma, makeStorage(), makeConfig());
  for (const bad of ['', 'notmime', 'just/', '/missing', 'space in/it', null, undefined]) {
    let threw = false;
    try {
      await svc.createUploadSlot(ACTOR, REQ, { ...VALID_INPUT, contentType: bad });
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400);
    }
    assert.ok(threw, `expected reject for contentType=${JSON.stringify(bad)}`);
  }
});
