// Story 8-2 AC2 + AC3: EvidenceFinalizeService — HEAD, transition,
// outbox emit, scope-check.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { EvidenceFinalizeService } = await import('../dist/evidence/evidence-finalize.service.js');

const ORG = '11111111-1111-4111-8111-111111111111';
const ORG2 = '22222222-2222-4222-8222-222222222222';
const ACTOR_USER = '33333333-3333-4333-8333-333333333333';
const EMP = '44444444-4444-4444-8444-444444444444';
const REQ = '55555555-5555-4555-8555-555555555555';
const EV = '66666666-6666-4666-8666-666666666666';

const ACTOR = {
  user_id: ACTOR_USER,
  organization_id: ORG,
  role: 'EMPLOYEE',
  display_name: 'Worker',
};

const KEY = `org/${ORG}/evidence/${EMP}/${EV}/r.pdf`;

function makeStorage({ head = { etag: 'abc123', contentType: 'application/pdf', sizeBytes: 1024 } } = {}) {
  const calls = { head: [] };
  return {
    calls,
    async presignPut() {
      throw new Error('not expected in finalize');
    },
    async head(key) {
      calls.head.push(key);
      return head;
    },
  };
}

function makePrisma({
  row = {
    id: EV,
    state: 'DRAFT',
    requirement_id: REQ,
    storage_object_key: KEY,
    employee_id: EMP,
    size_bytes: 1024n,
  },
  updateImpl = null,
} = {}) {
  const calls = { tx: 0, sql: [], queryRaw: [], evidenceUpdate: [], outboxCreate: [] };
  const tx = {
    $queryRaw: async (template, ...params) => {
      calls.queryRaw.push({ template, params });
      // Two queryRaw calls happen inside the tx: one for SET LOCAL,
      // one for SELECT FOR UPDATE. Differentiate by template content.
      const sqlStr = Array.isArray(template?.strings) ? template.strings.join('?') : String(template);
      if (/SELECT id/.test(sqlStr)) {
        // Defense: the SELECT must include FOR UPDATE; without it,
        // the concurrency guarantee evaporates. This assertion fires
        // at the test boundary so a future refactor that drops the
        // clause fails loudly.
        if (!/FOR UPDATE/i.test(sqlStr)) {
          throw new Error('SELECT must use FOR UPDATE for concurrent-finalize safety');
        }
        return row ? [row] : [];
      }
      return [];
    },
    $executeRaw: async (template, ...params) => {
      calls.sql.push({ sql: String(template?.strings?.join?.('?') ?? template), params });
      return 0;
    },
    evidence: {
      update: async ({ where, data }) => {
        calls.evidenceUpdate.push({ where, data });
        if (updateImpl) return updateImpl(where, data);
        return {
          id: where.id,
          organizationId: ORG,
          employeeId: EMP,
          requirementId: REQ,
          state: data.state,
          storageObjectKey: row?.storage_object_key ?? KEY,
          storageEtag: data.storageEtag,
          contentType: data.contentType,
          sizeBytes: data.sizeBytes,
          submittedAt: data.submittedAt,
          approvedAt: null,
          expiresAt: null,
          payload: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    },
    outboxEvent: {
      create: async ({ data }) => {
        calls.outboxCreate.push(data);
        return data;
      },
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

const VALID = { evidenceId: EV, key: KEY };

// ── AC2: happy path ───────────────────────────────────────────────

test('AC2: finalize transitions DRAFT → PENDING_APPROVAL with metadata and emits evidence.submitted', async () => {
  const storage = makeStorage();
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceFinalizeService(prisma, storage);
  const result = await svc.finalize(ACTOR, REQ, VALID);

  assert.equal(result.state, 'PENDING_APPROVAL');
  assert.equal(result.storageObjectKey, KEY);
  assert.equal(result.storageEtag, 'abc123');
  assert.equal(result.contentType, 'application/pdf');
  assert.equal(result.sizeBytes, 1024);
  assert.ok(result.submittedAt, 'submittedAt must be set');

  // HEAD was called against the validated key.
  assert.deepEqual(storage.calls.head, [KEY]);
  // Exactly one withOrgScope tx ran.
  assert.equal(calls.tx, 1);
  // Update touched the right fields.
  assert.equal(calls.evidenceUpdate.length, 1);
  const upd = calls.evidenceUpdate[0];
  assert.equal(upd.where.id, EV);
  assert.equal(upd.data.state, 'PENDING_APPROVAL');
  assert.equal(upd.data.storageEtag, 'abc123');
  assert.equal(upd.data.contentType, 'application/pdf');
  assert.equal(typeof upd.data.sizeBytes, 'bigint');
  assert.equal(upd.data.sizeBytes, 1024n);
  assert.ok(upd.data.submittedAt instanceof Date);

  // evidence.submitted outbox row emitted with the right shape.
  assert.equal(calls.outboxCreate.length, 1);
  const outbox = calls.outboxCreate[0];
  assert.equal(outbox.eventType, 'evidence.submitted');
  assert.equal(outbox.aggregateType, 'evidence');
  assert.equal(outbox.aggregateId, EV);
  assert.equal(outbox.organizationId, ORG);
  assert.equal(outbox.payload.after.evidenceId, EV);
  assert.equal(outbox.payload.after.requirementId, REQ);
  assert.equal(outbox.payload.after.employeeId, EMP);
  assert.equal(outbox.payload.before, null);
});

test('AC2: outbox payload validates against AuditEvent taxonomy', async () => {
  const { safeParseAuditEvent } = await import('@fcm/domain-contracts');
  const storage = makeStorage();
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceFinalizeService(prisma, storage);
  await svc.finalize(ACTOR, REQ, VALID);
  const outbox = calls.outboxCreate[0];
  // Construct the event as the relay would: outbox payload + the
  // outbox row's eventId/aggregateId stitched into the audit shape.
  const audited = {
    eventType: outbox.eventType,
    entityType: 'evidence',
    eventId: outbox.eventId,
    occurredAt: new Date().toISOString(),
    actorId: outbox.payload.actorId,
    organizationId: outbox.organizationId,
    entityId: outbox.aggregateId,
    reason: outbox.payload.reason,
    before: outbox.payload.before,
    after: outbox.payload.after,
  };
  const parsed = safeParseAuditEvent(audited);
  assert.ok(parsed.ok, `relay would reject: ${parsed.ok ? '' : JSON.stringify(parsed.error?.issues)}`);
});

// ── AC3: forbidden scope ──────────────────────────────────────────

test('AC3: key under DIFFERENT org returns 403 FORBIDDEN_SCOPE', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceFinalizeService(prisma, makeStorage());
  const wrongKey = `org/${ORG2}/evidence/${EMP}/${EV}/r.pdf`;
  let threw = false;
  try {
    await svc.finalize(ACTOR, REQ, { evidenceId: EV, key: wrongKey });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 403);
    assert.equal(err.getResponse()?.error, 'FORBIDDEN_SCOPE');
  }
  assert.ok(threw);
  // Scope-fail must happen BEFORE any DB tx or HEAD call.
  assert.equal(calls.tx, 0);
});

test('AC3: scope check fires before HEAD or DB (no S3 call, no tx for cross-org key)', async () => {
  const { prisma, calls } = makePrisma();
  const storage = makeStorage();
  const svc = new EvidenceFinalizeService(prisma, storage);
  try {
    await svc.finalize(ACTOR, REQ, {
      evidenceId: EV,
      key: `org/${ORG2}/evidence/${EMP}/${EV}/r.pdf`,
    });
  } catch {
    // expected
  }
  assert.equal(storage.calls.head.length, 0, 'HEAD must not fire for a misscoped key');
  assert.equal(calls.tx, 0, 'tx must not open for a misscoped key');
});

// ── HEAD-not-found path ───────────────────────────────────────────

test('AC2: HEAD-miss returns 404', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceFinalizeService(prisma, makeStorage({ head: null }));
  let threw = false;
  try {
    await svc.finalize(ACTOR, REQ, VALID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw);
});

test('HEAD throwing returns 502 (storage upstream issue)', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceFinalizeService(prisma, {
    async head() {
      throw new Error('s3 timeout');
    },
  });
  let threw = false;
  try {
    await svc.finalize(ACTOR, REQ, VALID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 502);
  }
  assert.ok(threw);
});

// ── Row-lookup paths ──────────────────────────────────────────────

test('returns 404 when evidenceId is unknown', async () => {
  const { prisma } = makePrisma({ row: null });
  const svc = new EvidenceFinalizeService(prisma, makeStorage());
  let threw = false;
  try {
    await svc.finalize(ACTOR, REQ, VALID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 404);
  }
  assert.ok(threw);
});

test('returns 400 when evidenceId belongs to a different requirement', async () => {
  const { prisma } = makePrisma({
    row: {
      id: EV,
      state: 'DRAFT',
      requirement_id: '99999999-9999-4999-8999-999999999999',
      storage_object_key: KEY,
      employee_id: EMP,
    },
  });
  const svc = new EvidenceFinalizeService(prisma, makeStorage());
  let threw = false;
  try {
    await svc.finalize(ACTOR, REQ, VALID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threw);
});

test('returns 403 FORBIDDEN_SCOPE when stored key disagrees with input (defense in depth)', async () => {
  const { prisma } = makePrisma({
    row: {
      id: EV,
      state: 'DRAFT',
      requirement_id: REQ,
      storage_object_key: `org/${ORG}/evidence/${EMP}/${EV}/different.pdf`,
      employee_id: EMP,
    },
  });
  const svc = new EvidenceFinalizeService(prisma, makeStorage());
  let threw = false;
  try {
    await svc.finalize(ACTOR, REQ, VALID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 403);
    assert.equal(err.getResponse()?.error, 'FORBIDDEN_SCOPE');
  }
  assert.ok(threw);
});

// ── AC1: content-length-range enforcement at finalize ──

test('AC1: head.sizeBytes > declared size returns 400 CONTENT_LENGTH_MISMATCH', async () => {
  // The presigned PUT URL does not SigV4-sign Content-Length on the
  // browser-PUT path, so a client could declare 1024 bytes at slot
  // creation and PUT 1 GB to S3. The finalize service must reject
  // the size disagreement and keep the row in DRAFT.
  const { prisma } = makePrisma({
    row: {
      id: EV,
      state: 'DRAFT',
      requirement_id: REQ,
      storage_object_key: KEY,
      employee_id: EMP,
      size_bytes: 1024n,
    },
  });
  const storage = makeStorage({
    head: { etag: 'abc', contentType: 'application/pdf', sizeBytes: 5 * 1024 * 1024 },
  });
  const svc = new EvidenceFinalizeService(prisma, storage);
  let threw = false;
  try {
    await svc.finalize(ACTOR, REQ, VALID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
    assert.equal(err.getResponse()?.error, 'CONTENT_LENGTH_MISMATCH');
  }
  assert.ok(threw);
});

test('AC1: head.sizeBytes < declared size also returns 400 CONTENT_LENGTH_MISMATCH', async () => {
  // Same-direction enforcement: a client that declared 1 MB but
  // uploaded 100 KB indicates either a UI bug or an attacker
  // trying to pivot the slot to a smaller object. Reject either way.
  const { prisma } = makePrisma({
    row: {
      id: EV,
      state: 'DRAFT',
      requirement_id: REQ,
      storage_object_key: KEY,
      employee_id: EMP,
      size_bytes: 1024n,
    },
  });
  const storage = makeStorage({
    head: { etag: 'abc', contentType: 'application/pdf', sizeBytes: 512 },
  });
  const svc = new EvidenceFinalizeService(prisma, storage);
  let threw = false;
  try {
    await svc.finalize(ACTOR, REQ, VALID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
    assert.equal(err.getResponse()?.error, 'CONTENT_LENGTH_MISMATCH');
  }
  assert.ok(threw);
});

test('AC1: missing declared size on DRAFT row returns 400 CONTENT_LENGTH_MISMATCH', async () => {
  // A pre-fix DRAFT row (from before story 8-2 shipped the pinning)
  // would have size_bytes null. The finalize service must refuse to
  // accept the upload rather than silently letting any size through.
  const { prisma } = makePrisma({
    row: {
      id: EV,
      state: 'DRAFT',
      requirement_id: REQ,
      storage_object_key: KEY,
      employee_id: EMP,
      size_bytes: null,
    },
  });
  const svc = new EvidenceFinalizeService(prisma, makeStorage());
  let threw = false;
  try {
    await svc.finalize(ACTOR, REQ, VALID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
    assert.equal(err.getResponse()?.error, 'CONTENT_LENGTH_MISMATCH');
  }
  assert.ok(threw);
});

// ── State-machine integration ─────────────────────────────────────

test('returns 409 illegal_state_transition when evidence is already PENDING_APPROVAL', async () => {
  const { prisma } = makePrisma({
    row: {
      id: EV,
      state: 'PENDING_APPROVAL',
      requirement_id: REQ,
      storage_object_key: KEY,
      employee_id: EMP,
    },
  });
  const svc = new EvidenceFinalizeService(prisma, makeStorage());
  let threw = false;
  try {
    await svc.finalize(ACTOR, REQ, VALID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
    const body = err.getResponse();
    assert.equal(body.error, 'illegal_state_transition');
    assert.equal(body.from, 'PENDING_APPROVAL');
    assert.equal(body.to, 'PENDING_APPROVAL');
  }
  assert.ok(threw);
});

test('returns 409 when evidence is APPROVED (cannot re-finalize)', async () => {
  const { prisma } = makePrisma({
    row: {
      id: EV,
      state: 'APPROVED',
      requirement_id: REQ,
      storage_object_key: KEY,
      employee_id: EMP,
    },
  });
  const svc = new EvidenceFinalizeService(prisma, makeStorage());
  let threw = false;
  try {
    await svc.finalize(ACTOR, REQ, VALID);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
  }
  assert.ok(threw);
});

// ── Input validation ──────────────────────────────────────────────

test('rejects requirementId / evidenceId / key with 400 when malformed', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceFinalizeService(prisma, makeStorage());
  const cases = [
    { requirementId: 'bad', input: VALID },
    { requirementId: REQ, input: { evidenceId: 'bad', key: KEY } },
    { requirementId: REQ, input: { evidenceId: EV, key: '' } },
    { requirementId: REQ, input: { evidenceId: EV, key: 'x'.repeat(2000) } },
  ];
  for (const c of cases) {
    let threw = false;
    try {
      await svc.finalize(ACTOR, c.requirementId, c.input);
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400);
    }
    assert.ok(threw, `expected 400 for ${JSON.stringify(c)}`);
  }
});

// ── AC4: integration — upload-slot → finalize → state-machine ──

test('AC4 (integration): upload-slot then finalize round-trips through both services', async () => {
  // This stitches the two services through a single in-memory
  // prisma + storage. The upload-slot creates a DRAFT row whose
  // stored key is what finalize subsequently consumes.
  const { EvidenceUploadService } = await import('../dist/evidence/evidence-upload.service.js');

  const orgId = ORG;
  const empId = EMP;
  const reqId = REQ;
  const requirementRow = { id: reqId, organizationId: orgId, active: true, evidenceType: 'FILE' };
  const employeeRow = { id: empId, userId: ACTOR_USER, organizationId: orgId, deactivatedAt: null };

  // Shared in-memory state.
  const rows = new Map();
  const outboxRows = [];
  const tx = {
    requirement: { findUnique: async ({ where }) => (where.id === requirementRow.id ? requirementRow : null) },
    employee: {
      findFirst: async ({ where }) => {
        if (
          where.userId === employeeRow.userId &&
          where.organizationId === employeeRow.organizationId
        ) {
          return employeeRow;
        }
        return null;
      },
    },
    evidence: {
      create: async ({ data }) => {
        const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
        rows.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const existing = rows.get(where.id);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        rows.set(where.id, updated);
        return updated;
      },
    },
    outboxEvent: { create: async ({ data }) => { outboxRows.push(data); return data; } },
    $executeRaw: async () => 0,
    $queryRaw: async (template) => {
      const sqlStr = Array.isArray(template?.strings) ? template.strings.join('?') : String(template);
      if (/SELECT id/.test(sqlStr)) {
        // Re-fetch the row in the SELECT FOR UPDATE shape used by
        // finalize. Filter by the embedded id literal in the
        // template string.
        const allRows = [...rows.values()];
        return allRows
          .filter((r) => template.values && template.values.some((v) => v === r.id))
          .map((r) => ({
            id: r.id,
            state: r.state,
            requirement_id: r.requirementId,
            storage_object_key: r.storageObjectKey,
            employee_id: r.employeeId,
          }));
      }
      return [];
    },
  };
  // Prisma 5's $queryRaw template carries `values` plus `strings`. Bind
  // the synthesized fake above. Project size_bytes onto the row shape
  // so the finalize service's content-length check has a value to
  // compare HEAD's size against.
  tx.$queryRaw = async (template) => {
    if (template?.values?.length) {
      const targetId = template.values[0];
      const r = rows.get(targetId);
      if (!r) return [];
      return [{
        id: r.id,
        state: r.state,
        requirement_id: r.requirementId,
        storage_object_key: r.storageObjectKey,
        employee_id: r.employeeId,
        size_bytes: r.sizeBytes ?? null,
      }];
    }
    return [];
  };
  const prisma = { $transaction: async (fn) => await fn(tx) };

  const storage = {
    presignCalls: [],
    headCalls: [],
    async presignPut(args) {
      this.presignCalls.push(args);
      return { url: 'https://s3.fake/up', expiresAt: new Date('2026-06-01T00:00:00Z') };
    },
    async head(key) {
      this.headCalls.push(key);
      // Simulate S3 returning the bytes the upload-slot pinned.
      return { etag: 'etag-xyz', contentType: 'application/pdf', sizeBytes: 1024 };
    },
  };
  const config = {
    get: (k) =>
      ({
        EVIDENCE_UPLOAD_MIN_BYTES: 1,
        EVIDENCE_UPLOAD_MAX_BYTES: 25 * 1024 * 1024,
        EVIDENCE_UPLOAD_SLOT_TTL_SECONDS: 900,
      })[k],
  };

  const upload = new EvidenceUploadService(prisma, storage, config);
  const slot = await upload.createUploadSlot(ACTOR, reqId, {
    contentType: 'application/pdf',
    contentLength: 1024,
    filename: 'r.pdf',
  });
  assert.ok(slot.uploadUrl, 'expected upload URL');
  assert.equal(rows.size, 1);
  assert.equal([...rows.values()][0].state, 'DRAFT');

  const finalize = new EvidenceFinalizeService(prisma, storage);
  const finalized = await finalize.finalize(ACTOR, reqId, {
    evidenceId: slot.evidenceId,
    key: slot.key,
  });

  // AC4 — state-machine assertion: DRAFT → PENDING_APPROVAL succeeded
  // exactly once.
  assert.equal(finalized.state, 'PENDING_APPROVAL');
  assert.equal([...rows.values()][0].state, 'PENDING_APPROVAL');
  assert.equal(storage.headCalls.length, 1);
  assert.equal(outboxRows.length, 1);
  assert.equal(outboxRows[0].eventType, 'evidence.submitted');

  // Second finalize against the same row fails (state machine).
  let threw = false;
  try {
    await finalize.finalize(ACTOR, reqId, { evidenceId: slot.evidenceId, key: slot.key });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
  }
  assert.ok(threw, 'second finalize must fail state-machine check');
});
