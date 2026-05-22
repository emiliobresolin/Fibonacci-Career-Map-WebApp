// Story 7-7 — OrgSettingsService approval-workflow surface (org-level
// half; per-level overrides deferred as F7-7a).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { OrgSettingsService } = await import('../dist/configuration/org-settings.service.js');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR = { user_id: ADMIN_ID, organization_id: ORG_ID, role: 'ADMIN', display_name: 'Admin' };

function makeFake({ currentWorkflow = 'SINGLE', orgExists = true } = {}) {
  let state = orgExists ? { approvalWorkflowDefault: currentWorkflow } : null;
  const calls = { findUnique: [], update: [], outboxCreate: [], txCount: 0, rawSql: [], baseFindUnique: [] };
  const tx = {
    organization: {
      findUnique: async (args) => {
        calls.findUnique.push(args);
        return state;
      },
      update: async (args) => {
        calls.update.push(args);
        state = { ...state, ...args.data };
        return state;
      },
    },
    outboxEvent: { create: async (args) => { calls.outboxCreate.push(args); return args.data; } },
    $executeRaw: async (template, ...params) => {
      const sql = Array.isArray(template?.strings) ? template.strings.join('?') : String(template?.raw ?? template);
      calls.rawSql.push({ sql, params });
      return 0;
    },
  };
  // Reviewer M2: drift safeguard — assert every read goes through the
  // tx-scoped findUnique (RLS GUC set) and NEVER through the bare
  // prisma client. Mirrors the 7-6 visibility test fake.
  const prisma = {
    organization: {
      findUnique: async (args) => {
        calls.baseFindUnique.push(args);
        return state;
      },
    },
    $transaction: async (fn) => { calls.txCount += 1; return await fn(tx); },
  };
  return { prisma, calls };
}

// ── AC1: GET ────────────────────────────────────────────────────────
test('AC1: getApprovalWorkflow returns the current setting and runs inside withOrgScope (RLS)', async () => {
  const { prisma, calls } = makeFake({ currentWorkflow: 'HR_GATE' });
  const svc = new OrgSettingsService(prisma);
  const result = await svc.getApprovalWorkflow(ORG_ID);
  assert.deepEqual(result, { approvalWorkflowDefault: 'HR_GATE' });
  assert.equal(calls.txCount, 1, 'GET must run inside withOrgScope tx (RLS defense-in-depth)');
  assert.equal(calls.findUnique.length, 1, 'GET must use tx.findUnique (RLS-scoped)');
  assert.equal(calls.baseFindUnique.length, 0, 'GET must NOT use bare prisma.findUnique (bypasses RLS)');
});

test('AC1: getApprovalWorkflow throws 404 for unknown organization', async () => {
  const { prisma } = makeFake({ orgExists: false });
  const svc = new OrgSettingsService(prisma);
  let threw = false;
  try { await svc.getApprovalWorkflow(ORG_ID); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
  assert.ok(threw);
});

// ── AC2: validation ────────────────────────────────────────────────
test('AC2: updateApprovalWorkflow accepts SINGLE | DUAL_MANAGER | HR_GATE', async () => {
  for (const ok of ['SINGLE', 'DUAL_MANAGER', 'HR_GATE']) {
    const { prisma, calls } = makeFake({ currentWorkflow: 'SINGLE' });
    const svc = new OrgSettingsService(prisma);
    if (ok === 'SINGLE') {
      await svc.updateApprovalWorkflow(ORG_ID, { approvalWorkflowDefault: ok }, ACTOR);
      assert.equal(calls.update.length, 0, 'no-op should not write');
    } else {
      await svc.updateApprovalWorkflow(ORG_ID, { approvalWorkflowDefault: ok }, ACTOR);
      assert.equal(calls.update[0].data.approvalWorkflowDefault, ok);
    }
  }
});

test('AC2: updateApprovalWorkflow rejects unknown enum values', async () => {
  const { prisma } = makeFake();
  const svc = new OrgSettingsService(prisma);
  for (const bad of ['single', 'BOTH', '', null, 1]) {
    let threw = false;
    try { await svc.updateApprovalWorkflow(ORG_ID, { approvalWorkflowDefault: bad }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 400); }
    assert.ok(threw, `expected rejection for approvalWorkflowDefault ${String(bad)}`);
  }
});

test('AC2: workflow enum mirrors Prisma.ApprovalWorkflow (drift detector)', async () => {
  const { ApprovalWorkflow } = await import('@prisma/client');
  const fromPrisma = Object.values(ApprovalWorkflow).sort();
  assert.deepEqual(fromPrisma, ['DUAL_MANAGER', 'HR_GATE', 'SINGLE']);
});

// ── AC3: audit emission + row-lock ─────────────────────────────────
test('AC3: updateApprovalWorkflow emits one approval_workflow.changed event in same tx; row-lock first', async () => {
  const { prisma, calls } = makeFake({ currentWorkflow: 'SINGLE' });
  const svc = new OrgSettingsService(prisma);
  await svc.updateApprovalWorkflow(ORG_ID, { approvalWorkflowDefault: 'HR_GATE' }, ACTOR);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.outboxCreate.length, 1);
  assert.equal(calls.txCount, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'approval_workflow.changed');
  assert.equal(outbox.aggregateType, 'approval_workflow');
  assert.equal(outbox.aggregateId, ORG_ID);
  assert.equal(outbox.payload.before.fromKind, 'SINGLE');
  assert.equal(outbox.payload.after.toKind, 'HR_GATE');
  // Race fix: SELECT FOR UPDATE before read
  const lockSql = calls.rawSql.find((r) => /FOR UPDATE/i.test(r.sql));
  assert.ok(lockSql, 'SELECT ... FOR UPDATE must be called before the read');
});

test('AC3: emitted payload validates against AuditEvent taxonomy (ApprovalWorkflowChanged)', async () => {
  const { prisma, calls } = makeFake({ currentWorkflow: 'SINGLE' });
  const svc = new OrgSettingsService(prisma);
  await svc.updateApprovalWorkflow(ORG_ID, { approvalWorkflowDefault: 'DUAL_MANAGER' }, ACTOR);
  const outbox = calls.outboxCreate[0].data;
  const candidate = {
    eventId: outbox.eventId,
    occurredAt: new Date().toISOString(),
    actorId: ADMIN_ID,
    organizationId: outbox.organizationId,
    entityType: outbox.aggregateType,
    entityId: outbox.aggregateId,
    eventType: outbox.eventType,
    ...outbox.payload,
  };
  assert.equal(safeParseAuditEvent(candidate).ok, true);
});

// ── idempotent no-op ───────────────────────────────────────────────
test('updateApprovalWorkflow to the SAME value is a no-op (no write, no audit)', async () => {
  const { prisma, calls } = makeFake({ currentWorkflow: 'HR_GATE' });
  const svc = new OrgSettingsService(prisma);
  await svc.updateApprovalWorkflow(ORG_ID, { approvalWorkflowDefault: 'HR_GATE' }, ACTOR);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.outboxCreate.length, 0);
});

test('updateApprovalWorkflow on unknown org throws 404', async () => {
  const { prisma } = makeFake({ orgExists: false });
  const svc = new OrgSettingsService(prisma);
  let threw = false;
  try { await svc.updateApprovalWorkflow(ORG_ID, { approvalWorkflowDefault: 'SINGLE' }, ACTOR); } catch (err) { threw = true; assert.equal(err.getStatus(), 404); }
  assert.ok(threw);
});
