// Story 8-5: admin/HR override + direct-manager review authorization
// + actor_role on audit events.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { EvidenceReviewService } = await import('../dist/evidence/evidence-review.service.js');
const { authorizeEvidenceReview } = await import('../dist/evidence/evidence-authz.js');

const ORG = '11111111-1111-4111-8111-111111111111';
const ADMIN_USER = '22222222-2222-4222-8222-222222222222';
const MGR_USER = '33333333-3333-4333-8333-333333333333';
const STRANGER_USER = '44444444-4444-4444-8444-444444444444';
const OWNER_USER = '55555555-5555-4555-8555-555555555555';

const EMP = '66666666-6666-4666-8666-666666666666';
const MGR_EMP = '77777777-7777-4777-8777-777777777777';
const STRANGER_EMP = '88888888-8888-4888-8888-888888888888';
const EV = '99999999-9999-4999-8999-999999999999';
const REQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const APPROVE_REASON = 'Validated against the requirement criteria — approved.';
const REJECT_REASON = 'Insufficient detail in the supplied write-up; please add scope + impact.';

function actor({ user_id, role }) {
  return { user_id, organization_id: ORG, role, display_name: role };
}

function makePrisma({
  row = {
    state: 'PENDING_APPROVAL',
    employee_id: EMP,
    owner_user_id: OWNER_USER,
    expiry_months: null,
  },
  actorEmployee = { id: MGR_EMP },
  subjectAssignments = [{ managerEmployeeId: MGR_EMP, deactivatedAt: null }],
} = {}) {
  const calls = { outboxCreate: [], approvalRecordCreate: [] };
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
    employee: { findFirst: async () => actorEmployee },
    employeeAssignment: { findMany: async () => subjectAssignments },
    approvalRecord: {
      create: async ({ data }) => {
        calls.approvalRecordCreate.push(data);
        return { id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', ...data };
      },
    },
    outboxEvent: {
      create: async ({ data }) => {
        calls.outboxCreate.push(data);
        return data;
      },
    },
  };
  const prisma = { $transaction: async (fn) => await fn(tx) };
  return { prisma, calls };
}

const noopQueue = { async add() {} };

// ── AC1: ADMIN-override path ──────────────────────────────────────

test('AC1: ADMIN can approve any evidence (override path, no employee row required)', async () => {
  const { prisma } = makePrisma({ actorEmployee: null, subjectAssignments: [] });
  const svc = new EvidenceReviewService(prisma, noopQueue);
  const result = await svc.approve(
    actor({ user_id: ADMIN_USER, role: 'ADMIN' }),
    EV,
    { reason: APPROVE_REASON },
  );
  assert.equal(result.state, 'APPROVED');
});

test('AC1: ADMIN cannot self-approve their OWN evidence (self-approval guard fires first)', async () => {
  // PRD §9.2: even ADMIN cannot self-approve. The guard runs before
  // the override path so the 403 is `self_approval_not_allowed`,
  // not the generic authz deny.
  const { prisma } = makePrisma({
    row: { state: 'PENDING_APPROVAL', employee_id: EMP, owner_user_id: ADMIN_USER, expiry_months: null },
    actorEmployee: null,
    subjectAssignments: [],
  });
  const svc = new EvidenceReviewService(prisma, noopQueue);
  let threw = false;
  try {
    await svc.approve(actor({ user_id: ADMIN_USER, role: 'ADMIN' }), EV, { reason: APPROVE_REASON });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 403);
    assert.equal(err.getResponse()?.error, 'self_approval_not_allowed');
  }
  assert.ok(threw);
});

// ── AC1: MANAGER must be direct manager ───────────────────────────

test('AC1: MANAGER who is direct manager can approve', async () => {
  const { prisma } = makePrisma({
    actorEmployee: { id: MGR_EMP },
    subjectAssignments: [{ managerEmployeeId: MGR_EMP, deactivatedAt: null }],
  });
  const svc = new EvidenceReviewService(prisma, noopQueue);
  const result = await svc.approve(
    actor({ user_id: MGR_USER, role: 'MANAGER' }),
    EV,
    { reason: APPROVE_REASON },
  );
  assert.equal(result.state, 'APPROVED');
});

test('AC1: MANAGER who is NOT the direct manager gets 403 forbidden', async () => {
  const { prisma } = makePrisma({
    actorEmployee: { id: STRANGER_EMP },
    subjectAssignments: [{ managerEmployeeId: MGR_EMP, deactivatedAt: null }],
  });
  const svc = new EvidenceReviewService(prisma, noopQueue);
  let threw = false;
  try {
    await svc.approve(
      actor({ user_id: STRANGER_USER, role: 'MANAGER' }),
      EV,
      { reason: APPROVE_REASON },
    );
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 403);
    assert.equal(err.getResponse()?.error, 'forbidden');
  }
  assert.ok(threw);
});

test('AC1: MANAGER with deactivated assignment loses access', async () => {
  // Former manager: assignment soft-deactivated. The view side of
  // the authz module already enforces this; the review side must
  // mirror.
  const { prisma } = makePrisma({
    actorEmployee: { id: MGR_EMP },
    subjectAssignments: [{ managerEmployeeId: MGR_EMP, deactivatedAt: new Date() }],
  });
  const svc = new EvidenceReviewService(prisma, noopQueue);
  let threw = false;
  try {
    await svc.approve(actor({ user_id: MGR_USER, role: 'MANAGER' }), EV, { reason: APPROVE_REASON });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 403);
  }
  assert.ok(threw);
});

test('AC1: same authz applies to reject — non-direct MANAGER gets 403', async () => {
  const { prisma } = makePrisma({
    actorEmployee: { id: STRANGER_EMP },
    subjectAssignments: [{ managerEmployeeId: MGR_EMP, deactivatedAt: null }],
  });
  const svc = new EvidenceReviewService(prisma, noopQueue);
  let threw = false;
  try {
    await svc.reject(
      actor({ user_id: STRANGER_USER, role: 'MANAGER' }),
      EV,
      { reason: REJECT_REASON },
    );
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 403);
  }
  assert.ok(threw);
});

// ── AC2: audit event carries actorRole INSIDE `after` ─────────────
// Critical: it must live inside `after` (not top-level) so the
// outbox-relay actually persists it. The relay only writes the
// payload's `before` / `after` JSONB into audit_events; a top-level
// field would be validated and then dropped.

test('AC2: evidence.approved payload carries after.actorRole=MANAGER on direct-manager path', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, noopQueue);
  await svc.approve(actor({ user_id: MGR_USER, role: 'MANAGER' }), EV, { reason: APPROVE_REASON });
  // Must be INSIDE `after`, NOT at top level.
  assert.equal(calls.outboxCreate[0].payload.after.actorRole, 'MANAGER');
  assert.equal(calls.outboxCreate[0].payload.actorRole, undefined, 'top-level actorRole would be lost at relay');
});

test('AC2: evidence.approved payload carries after.actorRole=ADMIN on override path', async () => {
  const { prisma, calls } = makePrisma({ actorEmployee: null, subjectAssignments: [] });
  const svc = new EvidenceReviewService(prisma, noopQueue);
  await svc.approve(actor({ user_id: ADMIN_USER, role: 'ADMIN' }), EV, { reason: APPROVE_REASON });
  assert.equal(calls.outboxCreate[0].payload.after.actorRole, 'ADMIN');
});

test('AC2: evidence.rejected payload carries after.actorRole on direct-manager path', async () => {
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, noopQueue);
  await svc.reject(actor({ user_id: MGR_USER, role: 'MANAGER' }), EV, { reason: REJECT_REASON });
  assert.equal(calls.outboxCreate[0].payload.after.actorRole, 'MANAGER');
});

test('AC2: evidence.rejected payload carries after.actorRole=ADMIN on override path', async () => {
  const { prisma, calls } = makePrisma({ actorEmployee: null, subjectAssignments: [] });
  const svc = new EvidenceReviewService(prisma, noopQueue);
  await svc.reject(actor({ user_id: ADMIN_USER, role: 'ADMIN' }), EV, { reason: REJECT_REASON });
  assert.equal(calls.outboxCreate[0].payload.after.actorRole, 'ADMIN');
});

test('AC2: evidence.approved payload validates against the AuditEvent schema WITH actorRole', async () => {
  // Defends against the prior bug where the field was at the top
  // level — the schema accepted it (optional) but the relay dropped
  // it. With actorRole nested in `after`, the full payload validates
  // AND the relay persists the value.
  const { safeParseAuditEvent } = await import('@fcm/domain-contracts');
  const { prisma, calls } = makePrisma();
  const svc = new EvidenceReviewService(prisma, noopQueue);
  await svc.approve(actor({ user_id: ADMIN_USER, role: 'ADMIN' }), EV, { reason: APPROVE_REASON });
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
  // Critically: the parsed `after` includes actorRole, so the
  // persisted JSONB in audit_events will too.
  assert.equal(parsed.event.after.actorRole, 'ADMIN');
});

// ── pure helper tests ─────────────────────────────────────────────

test('authorizeEvidenceReview: ADMIN → ADMIN_OVERRIDE (even without employee row)', () => {
  const result = authorizeEvidenceReview({
    actor: { role: 'ADMIN' },
    actorEmployee: null,
    subjectAssignments: [],
  });
  assert.equal(result.allowed, true);
  assert.equal(result.via, 'ADMIN_OVERRIDE');
});

test('authorizeEvidenceReview: direct manager → DIRECT_MANAGER', () => {
  const result = authorizeEvidenceReview({
    actor: { role: 'MANAGER' },
    actorEmployee: { id: MGR_EMP },
    subjectAssignments: [{ managerEmployeeId: MGR_EMP, deactivatedAt: null }],
  });
  assert.equal(result.allowed, true);
  assert.equal(result.via, 'DIRECT_MANAGER');
});

test('authorizeEvidenceReview: EMPLOYEE role is denied (never review)', () => {
  // EMPLOYEE shouldn't reach this code path (controller @Roles
  // blocks it), but defense-in-depth: the predicate explicitly
  // denies non-ADMIN non-direct-manager actors.
  const result = authorizeEvidenceReview({
    actor: { role: 'EMPLOYEE' },
    actorEmployee: { id: STRANGER_EMP },
    subjectAssignments: [{ managerEmployeeId: MGR_EMP, deactivatedAt: null }],
  });
  assert.equal(result.allowed, false);
});

test('authorizeEvidenceReview: actor with no employee row + not ADMIN → denied', () => {
  const result = authorizeEvidenceReview({
    actor: { role: 'MANAGER' },
    actorEmployee: null,
    subjectAssignments: [],
  });
  assert.equal(result.allowed, false);
});
