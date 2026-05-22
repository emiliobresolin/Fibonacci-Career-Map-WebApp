// Story 6-2a AC4: EmployeesRepository surface + withOrgScope wiring.
//
// Verifies the repo exposes the documented method set and every method
// routes through withOrgScope (so RLS gates the underlying query). The
// live-DB self-management + uniqueness assertions are in the gated
// identity-integration.test.mjs (AC5).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { EmployeesRepository } = await import('../dist/identity/employees.repository.js');

const ORG = '11111111-1111-4111-8111-111111111111';
const EMP = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const TRACK = '44444444-4444-4444-8444-444444444444';
const LEVEL = '55555555-5555-4555-8555-555555555555';

function makeCapturingPrisma() {
  const calls = { scopes: [] };
  const tx = {
    $executeRaw: async (_strings, ...params) => {
      calls.scopes.push({ params });
      return 1;
    },
    employee: {
      findMany: async () => [],
      findUnique: async () => null,
      create: async (args) => ({
        id: EMP,
        organizationId: args.data.organizationId,
        userId: args.data.userId,
        careerTrackId: args.data.careerTrackId ?? null,
        levelId: args.data.levelId ?? null,
        assignedAt: args.data.assignedAt ?? null,
        deactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: async (args) => ({
        id: args.where.id,
        organizationId: ORG,
        userId: USER,
        careerTrackId: args.data.careerTrackId ?? null,
        levelId: args.data.levelId ?? null,
        assignedAt: null,
        deactivatedAt: args.data.deactivatedAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
    employeeAssignment: {
      findMany: async () => [],
      create: async (args) => ({
        id: 'assign-id',
        ...args.data,
        deactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: async (args) => ({
        id: args.where.id,
        employeeId: EMP,
        organizationId: ORG,
        role: 'EMPLOYEE',
        managerEmployeeId: null,
        assignedAt: new Date(),
        deactivatedAt: args.data.deactivatedAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    },
  };
  const prisma = { $transaction: async (fn) => fn(tx) };
  return { prisma, calls };
}

// ── Method shape ───────────────────────────────────────────────────

test('AC4: EmployeesRepository exposes the documented method set', () => {
  const repo = new EmployeesRepository({});
  for (const method of [
    'listActive',
    'findById',
    'findByUserId',
    'create',
    'update',
    'listAssignmentsForEmployee',
    'listDirectReports',
    'createAssignment',
    'deactivateAssignment',
  ]) {
    assert.equal(typeof repo[method], 'function', `missing ${method}`);
  }
});

// ── withOrgScope is invoked for every method ───────────────────────

test('listActive runs inside withOrgScope (RLS-gated)', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new EmployeesRepository(prisma);
  await repo.listActive(ORG);
  assert.equal(calls.scopes.length, 1);
  assert.ok(calls.scopes[0].params.includes(ORG));
});

test('findByUserId runs inside withOrgScope', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new EmployeesRepository(prisma);
  await repo.findByUserId(ORG, USER);
  assert.equal(calls.scopes.length, 1);
});

test('create runs inside withOrgScope and passes orgId into the data record', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new EmployeesRepository(prisma);
  const result = await repo.create(ORG, { userId: USER, careerTrackId: TRACK, levelId: LEVEL });
  assert.equal(calls.scopes.length, 1);
  // Verify orgId is bound to the SET app.current_org_id call.
  assert.ok(calls.scopes[0].params.includes(ORG));
  assert.equal(result.organizationId, ORG);
  assert.equal(result.userId, USER);
});

test('createAssignment runs inside withOrgScope', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new EmployeesRepository(prisma);
  await repo.createAssignment(ORG, {
    employeeId: EMP,
    role: 'EMPLOYEE',
    managerEmployeeId: null,
  });
  assert.equal(calls.scopes.length, 1);
});

test('listDirectReports runs inside withOrgScope', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new EmployeesRepository(prisma);
  await repo.listDirectReports(ORG, EMP);
  assert.equal(calls.scopes.length, 1);
});

test('deactivateAssignment sets deactivatedAt to a Date inside withOrgScope', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const repo = new EmployeesRepository(prisma);
  const result = await repo.deactivateAssignment(ORG, 'assign-id');
  assert.equal(calls.scopes.length, 1);
  assert.ok(result.deactivatedAt instanceof Date);
});

// ── orgId validation ───────────────────────────────────────────────

test('Repository surfaces RlsInvalidOrgIdError on non-UUID orgId (defense-in-depth)', async () => {
  const { RlsInvalidOrgIdError } = await import('../dist/prisma/rls.helpers.js');
  const { prisma } = makeCapturingPrisma();
  const repo = new EmployeesRepository(prisma);
  await assert.rejects(() => repo.listActive('not-a-uuid'), RlsInvalidOrgIdError);
});
