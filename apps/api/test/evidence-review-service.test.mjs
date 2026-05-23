// Story 8-4 AC2-AC5 — EvidenceReviewService.approve / reject.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { EvidenceReviewService } = await import('../dist/evidence/evidence-review.service.js');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG = '11111111-1111-4111-8111-111111111111';
const MGR_USER = '22222222-2222-4222-8222-222222222222';
const OWNER_USER = '33333333-3333-4333-8333-333333333333';
const EMP = '44444444-4444-4444-8444-444444444444';
const EV = '55555555-5555-4555-8555-555555555555';
const REQ = '66666666-6666-4666-8666-666666666666';

const managerActor = {
  user_id: MGR_USER,
  organization_id: ORG,
  role: 'MANAGER',
  display_name: 'Reviewer',
};

const APPROVE_REASON = 'Validated against the requirement criteria — approved.';
const REJECT_REASON = 'Insufficient detail in the supplied write-up; please add scope + impact.';

const MGR_EMP = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function makePrisma({
  row = {
    state: 'PENDING_APPROVAL',
    employee_id: EMP,
    owner_user_id: OWNER_USER,
    expiry_months: null,
    approved_at: null,
  },
  // Story 8-5 — defaults grant the actor MANAGER access (employee
  // row exists, subject's assignment lists the actor as direct
  // manager). Tests that need to assert the authz failure path
  // override these explicitly.
  actorEmployee = { id: MGR_EMP },
  subjectAssignments = [{ managerEmployeeId: MGR_EMP, deactivatedAt: null }],
} = {}) {
  const calls = {
    tx: 0,
    queryRaw: [],
    evidenceUpdate: [],
    approvalRecordCreate: [],
    outboxCreate: [],
    rawSql: [],
  };
  const tx = {
    $executeRaw: async (template, ...params) => {
      calls.rawSql.push({ template, params });
      return 0;
    },
    $queryRaw: async (template, ...params) => {
      calls.queryRaw.push({ template, params });
      const sqlStr = Array.isArray(template?.strings) ? template.strings.join('?') : String(template);
      if (/SELECT e\.state/.test(sqlStr)) {
        if (!/FOR UPDATE/i.test(sqlStr)) {
          throw new Error('SELECT must use FOR UPDATE');
        }
        return row ? [row] : [];
      }
      return [];
    },
    evidence: {
      update: async ({ where, data }) => {
        calls.evidenceUpdate.push({ where, data });
        return {
          id: where.id,
          employeeId: row?.employee_id ?? EMP,
          requirementId: REQ,
          state: data.state,
          approvedAt: data.approvedAt ?? null,
          expiresAt: data.expiresAt ?? null,
        };
      },
    },
    employee: {
      findFirst: async () => actorEmployee,
    },
    employeeAssignment: {
      findMany: async () => subjectAssignments,
    },
    approvalRecord: {
      create: async ({ data }) => {
        const record = { id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', ...data };
        calls.approvalRecordCreate.push(data);
        return record;
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

function makeQueue() {
  const calls = { add: [] };
  return {
    calls,
    async add(name, data, opts) {
      calls.add.push({ name, data, opts });
    },
  };
}

// ── AC2: reason length ────────────────────────────────────────────

test('AC2: approve rejects reason < 10 chars with 400', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  let threw = false;
  try {
    await svc.approve(managerActor, EV, { reason: 'too short' });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threw);
});

test('AC2: reject rejects reason < 20 chars with 400', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  let threw = false;
  try {
    await svc.reject(managerActor, EV, { reason: 'tooshortforreject' }); // 17 chars
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threw);
});

test('AC2: missing reason returns 400', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  for (const bad of [undefined, null, '', '   ', 123]) {
    let threw = false;
    try {
      await svc.approve(managerActor, EV, { reason: bad });
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400);
    }
    assert.ok(threw, `expected reject for reason=${JSON.stringify(bad)}`);
  }
});

// ── AC3: self-approval rejected ───────────────────────────────────

test('AC3: actor approving their OWN evidence returns 403 self_approval_not_allowed', async () => {
  const { prisma } = makePrisma({
    row: {
      state: 'PENDING_APPROVAL',
      employee_id: EMP,
      owner_user_id: MGR_USER, // owner === actor
      expiry_months: null,
    },
  });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  let threw = false;
  try {
    await svc.approve(managerActor, EV, { reason: APPROVE_REASON });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 403);
    assert.equal(err.getResponse()?.error, 'self_approval_not_allowed');
  }
  assert.ok(threw);
});

test('AC3: self-rejection also blocked', async () => {
  const { prisma } = makePrisma({
    row: {
      state: 'PENDING_APPROVAL',
      employee_id: EMP,
      owner_user_id: MGR_USER,
      expiry_months: null,
    },
  });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  let threw = false;
  try {
    await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 403);
  }
  assert.ok(threw);
});

// ── AC4: approval_records row written ─────────────────────────────

test('AC4: approve writes one approval_records row with actor + decision + reason + decided_at', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  const result = await svc.approve(managerActor, EV, { reason: APPROVE_REASON });
  assert.equal(calls.approvalRecordCreate.length, 1);
  const rec = calls.approvalRecordCreate[0];
  assert.equal(rec.organizationId, ORG);
  assert.equal(rec.evidenceId, EV);
  assert.equal(rec.actorId, MGR_USER);
  assert.equal(rec.decision, 'APPROVED');
  assert.equal(rec.reason, APPROVE_REASON);
  assert.ok(rec.decidedAt instanceof Date);
  assert.equal(result.approvalRecordId, 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
});

test('AC4: reject writes one approval_records row with decision=REJECTED', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  const result = await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  assert.equal(calls.approvalRecordCreate.length, 1);
  assert.equal(calls.approvalRecordCreate[0].decision, 'REJECTED');
  assert.equal(calls.approvalRecordCreate[0].reason, REJECT_REASON);
  assert.equal(result.state, 'REJECTED');
});

// ── AC5: state transition + audit + recalc enqueue ────────────────

test('AC5: approve flips state to APPROVED + stamps approved_at', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  const result = await svc.approve(managerActor, EV, { reason: APPROVE_REASON });
  assert.equal(result.state, 'APPROVED');
  assert.equal(calls.evidenceUpdate.length, 1);
  assert.equal(calls.evidenceUpdate[0].data.state, 'APPROVED');
  assert.ok(calls.evidenceUpdate[0].data.approvedAt instanceof Date);
});

test('AC5: approve computes expires_at = approvedAt + requirement.expiry_months', async () => {
  const { prisma } = makePrisma({
    row: {
      state: 'PENDING_APPROVAL',
      employee_id: EMP,
      owner_user_id: OWNER_USER,
      expiry_months: 12, // 1 year
    },
  });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  const result = await svc.approve(managerActor, EV, { reason: APPROVE_REASON });
  assert.ok(result.expiresAt, 'expiresAt must be set when requirement has expiry');
  const approved = new Date(result.approvedAt);
  const expires = new Date(result.expiresAt);
  const expected = new Date(approved);
  expected.setUTCMonth(expected.getUTCMonth() + 12);
  assert.equal(expires.getTime(), expected.getTime());
});

test('AC5: approve handles Feb-29 leap-day +12 months by clamping to Feb-28 (next year)', async () => {
  // setUTCMonth(month + 12) on Feb-29 would naively roll forward to
  // Mar-1 next year. The addMonths helper clamps back to Feb-28 so
  // the expires_at lands on the last day of the target month rather
  // than overshooting by one day. Matches Postgres `+ INTERVAL '1
  // year'` semantics.
  const fixedNow = new Date(Date.UTC(2024, 1, 29, 12, 0, 0)); // 2024-02-29
  const origDate = Date;
  // Patch the Date constructor inside the test scope so the service
  // sees Feb-29 as "now".
  globalThis.Date = class extends origDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedNow.getTime());
      } else {
        super(...args);
      }
    }
    static now() {
      return fixedNow.getTime();
    }
  };
  try {
    const { prisma } = makePrisma({
      row: {
        state: 'PENDING_APPROVAL',
        employee_id: EMP,
        owner_user_id: OWNER_USER,
        expiry_months: 12,
      },
    });
    const svc = new EvidenceReviewService(prisma, makeQueue());
    const result = await svc.approve(managerActor, EV, { reason: APPROVE_REASON });
    const expires = new origDate(result.expiresAt);
    // Must be Feb 28, 2025 (not Mar 1, 2025).
    assert.equal(expires.getUTCFullYear(), 2025);
    assert.equal(expires.getUTCMonth(), 1, 'month must be Feb (1)');
    assert.equal(expires.getUTCDate(), 28, 'day must be 28 (clamped)');
  } finally {
    globalThis.Date = origDate;
  }
});

test('AC5: approve leaves expires_at null when requirement has no expiry', async () => {
  const { prisma } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  const result = await svc.approve(managerActor, EV, { reason: APPROVE_REASON });
  assert.equal(result.expiresAt, null);
});

test('AC5: approve emits one evidence.approved outbox event', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  await svc.approve(managerActor, EV, { reason: APPROVE_REASON });
  assert.equal(calls.outboxCreate.length, 1);
  const out = calls.outboxCreate[0];
  assert.equal(out.eventType, 'evidence.approved');
  assert.equal(out.aggregateType, 'evidence');
  assert.equal(out.aggregateId, EV);
  assert.equal(out.payload.reason, APPROVE_REASON);
  // beforeScore / afterScore: 0 placeholders for Epic 8; real values
  // land with Epic 9 scoring.
  assert.equal(out.payload.before.beforeScore, 0);
  assert.equal(out.payload.after.afterScore, 0);
});

test('AC5: approve enqueues scoring.recalc-employee with trigger=evidence.approved', async () => {
  const { prisma } = makePrisma();
  const queue = makeQueue();
  const svc = new EvidenceReviewService(prisma, queue);
  await svc.approve(managerActor, EV, { reason: APPROVE_REASON });
  assert.equal(queue.calls.add.length, 1);
  const job = queue.calls.add[0];
  assert.equal(job.name, 'recalc');
  assert.equal(job.data.employeeId, EMP);
  assert.equal(job.data.trigger, 'evidence.approved');
  // Actor must be carried into the job payload (Story 2-5 invariant).
  assert.equal(job.data.actor.user_id, MGR_USER);
  // Deterministic jobId for dedup.
  assert.match(job.opts.jobId, new RegExp(`recalc:${EMP}:evidence.approved`));
});

test('AC5: reject flips state to REJECTED (no expires_at, no approved_at)', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  const result = await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  assert.equal(result.state, 'REJECTED');
  assert.equal(calls.evidenceUpdate[0].data.state, 'REJECTED');
  // The data patch only changes state — approvedAt / expiresAt are
  // left as-is (null for a never-approved row).
  assert.equal(calls.evidenceUpdate[0].data.approvedAt, undefined);
  assert.equal(calls.evidenceUpdate[0].data.expiresAt, undefined);
});

test('AC5: reject emits one evidence.rejected outbox event', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  assert.equal(calls.outboxCreate.length, 1);
  assert.equal(calls.outboxCreate[0].eventType, 'evidence.rejected');
  assert.equal(calls.outboxCreate[0].payload.reason, REJECT_REASON);
});

test('AC5: first-pass reject (PENDING → REJECTED) does NOT enqueue a recalc', async () => {
  // Row was never APPROVED, so it never contributed to score. No
  // recalc work to do. Story 8-6 retroactive path is what enqueues
  // (separate test below).
  const { prisma } = makePrisma();
  const queue = makeQueue();
  const svc = new EvidenceReviewService(prisma, queue);
  await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  assert.equal(queue.calls.add.length, 0);
});

// ── Story 8-6: retroactive rejection of APPROVED evidence ───────

test('8-6 AC1: APPROVED → REJECTED succeeds + preserves approved_at AND expires_at', async () => {
  const approvedAt = new Date('2026-01-15T10:00:00Z');
  const { prisma, calls } = makePrisma({
    row: {
      state: 'APPROVED',
      employee_id: EMP,
      owner_user_id: OWNER_USER,
      expiry_months: null,
      approved_at: approvedAt,
    },
  });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  const result = await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  assert.equal(result.state, 'REJECTED');
  assert.equal(result.retroactive, true);
  // The evidence.update payload must NOT touch approved_at OR
  // expires_at — both are historical facts that the audit-read
  // surface needs to render "approved on … expired on …" even after
  // the row is REJECTED. The 8-1 CHECK allows REJECTED with either
  // NULL or NOT NULL approved_at.
  assert.equal(calls.evidenceUpdate[0].data.approvedAt, undefined);
  assert.equal(calls.evidenceUpdate[0].data.expiresAt, undefined);
  assert.equal(calls.evidenceUpdate[0].data.state, 'REJECTED');
});

test('8-6 AC1: ADMIN can retroactively reject (admin override applies to retroactive path too)', async () => {
  const ADMIN_USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const adminActor = {
    user_id: ADMIN_USER,
    organization_id: ORG,
    role: 'ADMIN',
    display_name: 'Admin',
  };
  const approvedAt = new Date('2026-01-15T10:00:00Z');
  const { prisma } = makePrisma({
    row: {
      state: 'APPROVED',
      employee_id: EMP,
      owner_user_id: OWNER_USER,
      expiry_months: null,
      approved_at: approvedAt,
    },
    actorEmployee: null,
    subjectAssignments: [],
  });
  const queue = makeQueue();
  const svc = new EvidenceReviewService(prisma, queue);
  const result = await svc.reject(adminActor, EV, { reason: REJECT_REASON });
  assert.equal(result.state, 'REJECTED');
  assert.equal(result.retroactive, true);
  // Admin retro-reject also enqueues the recalc.
  assert.equal(queue.calls.add.length, 1);
  assert.equal(queue.calls.add[0].data.trigger, 'evidence.retroactively_rejected');
});

test('8-6 AC2: retroactive rejection enqueues recalc with evidence.retroactively_rejected trigger', async () => {
  const approvedAt = new Date('2026-01-15T10:00:00Z');
  const { prisma } = makePrisma({
    row: {
      state: 'APPROVED',
      employee_id: EMP,
      owner_user_id: OWNER_USER,
      expiry_months: null,
      approved_at: approvedAt,
    },
  });
  const queue = makeQueue();
  const svc = new EvidenceReviewService(prisma, queue);
  await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  assert.equal(queue.calls.add.length, 1);
  const job = queue.calls.add[0];
  assert.equal(job.data.trigger, 'evidence.retroactively_rejected');
  assert.equal(job.data.employeeId, EMP);
  assert.equal(job.data.actor.user_id, MGR_USER);
  // jobId carries the originatingEventId (= approval record id) so
  // two retroactive rejects on DIFFERENT evidence rows for the same
  // employee don't coalesce in BullMQ. See B1-regression test below.
  assert.match(
    job.opts.jobId,
    new RegExp(`^recalc:${EMP}:evidence.retroactively_rejected:[0-9a-f-]+$`),
  );
});

test('8-6 B1-regression: two retroactive rejects on the same employee get DIFFERENT jobIds (no BullMQ coalesce)', async () => {
  // Without the originatingEventId in jobId, two rapid retroactive
  // rejections of different evidence rows for the same employee
  // would dedupe at BullMQ and the second's score effect would be
  // lost (if the first recalc snapshotted state before the second
  // commit). Originating-event-id-in-jobId is the fix; this test
  // pins it so a future "simplify the jobId" change fails loudly.
  const approvedAt = new Date('2026-01-15T10:00:00Z');
  const queue = makeQueue();
  // First retro-reject — use a stub that returns approvalRecordId
  // = 'first-record'.
  let recordCounter = 0;
  const sharedTxFactory = () => {
    recordCounter += 1;
    const recordId = `${recordCounter}1111111-1111-4111-8111-aaaaaaaaaaaa`.slice(0, 36);
    const { prisma } = makePrismaWithRecordId({
      row: {
        state: 'APPROVED',
        employee_id: EMP,
        owner_user_id: OWNER_USER,
        expiry_months: null,
        approved_at: approvedAt,
      },
      recordId,
    });
    return prisma;
  };
  const svc1 = new EvidenceReviewService(sharedTxFactory(), queue);
  await svc1.reject(managerActor, EV, { reason: REJECT_REASON });
  const svc2 = new EvidenceReviewService(sharedTxFactory(), queue);
  await svc2.reject(
    managerActor,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    { reason: REJECT_REASON },
  );
  assert.equal(queue.calls.add.length, 2);
  assert.notEqual(
    queue.calls.add[0].opts.jobId,
    queue.calls.add[1].opts.jobId,
    'two retroactive rejects on the same employee MUST get distinct jobIds',
  );
});

function makePrismaWithRecordId({ row, recordId }) {
  const tx = {
    $executeRaw: async () => 0,
    $queryRaw: async (template) => {
      const sqlStr = Array.isArray(template?.strings) ? template.strings.join('?') : String(template);
      if (/SELECT e\.state/.test(sqlStr)) return [row];
      return [];
    },
    evidence: {
      update: async ({ where, data }) => ({
        id: where.id,
        employeeId: EMP,
        requirementId: REQ,
        state: data.state,
        approvedAt: data.approvedAt ?? null,
        expiresAt: data.expiresAt ?? null,
      }),
    },
    employee: { findFirst: async () => ({ id: MGR_EMP }) },
    employeeAssignment: {
      findMany: async () => [{ managerEmployeeId: MGR_EMP, deactivatedAt: null }],
    },
    approvalRecord: { create: async ({ data }) => ({ id: recordId, ...data }) },
    outboxEvent: { create: async ({ data }) => data },
  };
  const prisma = { $transaction: async (fn) => await fn(tx) };
  return { prisma };
}

test('8-6 AC3: audit payload carries retroactive=true + approvedAt + rejectedAt (date-discrepancy investigation)', async () => {
  const approvedAt = new Date('2026-01-15T10:00:00Z');
  const { prisma, calls } = makePrisma({
    row: {
      state: 'APPROVED',
      employee_id: EMP,
      owner_user_id: OWNER_USER,
      expiry_months: null,
      approved_at: approvedAt,
    },
  });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  const out = calls.outboxCreate[0];
  assert.equal(out.eventType, 'evidence.rejected');
  assert.equal(out.payload.after.retroactive, true);
  assert.equal(out.payload.after.approvedAt, approvedAt.toISOString());
  assert.ok(out.payload.after.rejectedAt, 'rejectedAt must be set');
  // rejectedAt must be a valid ISO string AFTER approvedAt.
  const rejectedAt = new Date(out.payload.after.rejectedAt);
  assert.ok(rejectedAt.getTime() > approvedAt.getTime());
});

test('8-6 AC3: audit payload from first-pass reject DOES NOT carry retroactive/approvedAt/rejectedAt', async () => {
  // The retroactive fields are only present on the APPROVED → REJECTED
  // path. PENDING → REJECTED keeps the legacy payload shape so audit
  // readers can detect retroactive cases purely by field presence.
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  const after = calls.outboxCreate[0].payload.after;
  assert.equal(after.retroactive, undefined);
  assert.equal(after.approvedAt, undefined);
  assert.equal(after.rejectedAt, undefined);
});

test('8-6: retroactive audit payload validates against the AuditEvent contract', async () => {
  const { safeParseAuditEvent } = await import('@fcm/domain-contracts');
  const approvedAt = new Date('2026-01-15T10:00:00Z');
  const { prisma, calls } = makePrisma({
    row: {
      state: 'APPROVED',
      employee_id: EMP,
      owner_user_id: OWNER_USER,
      expiry_months: null,
      approved_at: approvedAt,
    },
  });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  await svc.reject(managerActor, EV, { reason: REJECT_REASON });
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
  assert.equal(parsed.event.after.retroactive, true);
});

test('8-6: REJECTED → REJECTED is still illegal (terminal state)', async () => {
  const { prisma } = makePrisma({
    row: { state: 'REJECTED', employee_id: EMP, owner_user_id: OWNER_USER, expiry_months: null, approved_at: null },
  });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  let threw = false;
  try {
    await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
    assert.equal(err.getResponse()?.error, 'illegal_state_transition');
  }
  assert.ok(threw);
});

test('8-6: EXPIRED → REJECTED is still illegal (terminal state)', async () => {
  const { prisma } = makePrisma({
    row: { state: 'EXPIRED', employee_id: EMP, owner_user_id: OWNER_USER, expiry_months: null, approved_at: new Date() },
  });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  let threw = false;
  try {
    await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
  }
  assert.ok(threw);
});

// ── State-machine integration ─────────────────────────────────────

test('approve rejects when evidence is DRAFT with 409 illegal_state_transition', async () => {
  const { prisma } = makePrisma({
    row: { state: 'DRAFT', employee_id: EMP, owner_user_id: OWNER_USER, expiry_months: null },
  });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  let threw = false;
  try {
    await svc.approve(managerActor, EV, { reason: APPROVE_REASON });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
    assert.equal(err.getResponse()?.error, 'illegal_state_transition');
    assert.equal(err.getResponse()?.from, 'DRAFT');
  }
  assert.ok(threw);
});

test('Story 8-6: reject NOW accepts APPROVED source (retroactive rejection)', async () => {
  // Story 8-4 originally returned 409 use_retroactive_reject_endpoint
  // for APPROVED → REJECTED, with the comment that 8-6 would land
  // the retroactive path. 8-6 ships that path on the SAME endpoint,
  // gated by source state. APPROVED → REJECTED now succeeds.
  const approvedAt = new Date('2026-01-15T10:00:00Z');
  const { prisma } = makePrisma({
    row: {
      state: 'APPROVED',
      employee_id: EMP,
      owner_user_id: OWNER_USER,
      expiry_months: null,
      approved_at: approvedAt,
    },
  });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  const result = await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  assert.equal(result.state, 'REJECTED');
  assert.equal(result.retroactive, true);
});

test('reject returns generic illegal_state_transition for truly illegal sources (DRAFT)', async () => {
  const { prisma } = makePrisma({
    row: { state: 'DRAFT', employee_id: EMP, owner_user_id: OWNER_USER, expiry_months: null },
  });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  let threw = false;
  try {
    await svc.reject(managerActor, EV, { reason: REJECT_REASON });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
    assert.equal(err.getResponse()?.error, 'illegal_state_transition');
  }
  assert.ok(threw);
});

test('approve/reject return 404 when evidenceId is unknown', async () => {
  const { prisma } = makePrisma({ row: null });
  const svc = new EvidenceReviewService(prisma, makeQueue());
  for (const op of ['approve', 'reject']) {
    let threw = false;
    try {
      await svc[op](managerActor, EV, {
        reason: op === 'approve' ? APPROVE_REASON : REJECT_REASON,
      });
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 404);
    }
    assert.ok(threw, `${op} must 404 on missing row`);
  }
});

// ── Audit payload validates against the AuditEvent taxonomy ──────

test('AC5: evidence.approved outbox payload validates against AuditEvent schema', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  await svc.approve(managerActor, EV, { reason: APPROVE_REASON });
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

test('AC5: evidence.rejected outbox payload validates against AuditEvent schema', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, makeQueue());
  await svc.reject(managerActor, EV, { reason: REJECT_REASON });
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

// ── Recalc enqueue best-effort ────────────────────────────────────

test('approve still succeeds even if recalc enqueue throws (state + audit already committed)', async () => {
  const { prisma } = makePrisma();
  const flakyQueue = {
    async add() {
      throw new Error('redis temporarily unavailable');
    },
  };
  const svc = new EvidenceReviewService(prisma, flakyQueue);
  const result = await svc.approve(managerActor, EV, { reason: APPROVE_REASON });
  assert.equal(result.state, 'APPROVED');
});
