// Story 6-2b AC2: BlockersController validation + role gating.
//
// The @Roles('ADMIN') decorator is enforced by the global JwtAuthGuard
// (Story 2-4) — that part is covered by the auth-guard test suite.
// What we pin here is the controller's body-validation contract,
// the conflict-on-duplicate-active-blocker mapping, and the 409 on
// already-resolved.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BlockersController } = await import('../dist/identity/blockers.controller.js');
const { BlockerAlreadyResolvedError } = await import('../dist/identity/blockers.repository.js');

const ORG = '11111111-1111-4111-8111-111111111111';
const EMP = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const BLOCKER = '44444444-4444-4444-8444-444444444444';

const ACTOR_CTX = {
  user_id: ACTOR,
  organization_id: ORG,
  role: 'ADMIN',
  display_name: 'Admin',
};

function makeEmployeesRepo({ findResult = { id: EMP } } = {}) {
  return { findById: async () => findResult };
}

function makeBlockersRepo({
  openResult = null,
  openThrows = null,
  resolveResult = null,
  resolveThrows = null,
} = {}) {
  return {
    open: async () => {
      if (openThrows) throw openThrows;
      return openResult ?? { id: BLOCKER, employeeId: EMP, kind: 'PIP' };
    },
    resolve: async () => {
      if (resolveThrows) throw resolveThrows;
      return resolveResult ?? { id: BLOCKER, employeeId: EMP, kind: 'PIP' };
    },
  };
}

async function expectStatus(promise, expected) {
  try {
    await promise;
    assert.fail(`expected ${expected}, got resolved value`);
  } catch (err) {
    assert.equal(err.getStatus?.(), expected, `expected ${expected}, got ${err.getStatus?.()}`);
  }
}

// ── POST /v1/employees/:id/blockers ────────────────────────────────

test('400 when employeeId is not a UUID', async () => {
  const ctrl = new BlockersController(makeBlockersRepo(), makeEmployeesRepo());
  await expectStatus(ctrl.open(ACTOR_CTX, 'not-a-uuid', { kind: 'PIP', reason: 'x'.repeat(25) }), 400);
});

test('400 when kind is not a BlockerKind enum value', async () => {
  const ctrl = new BlockersController(makeBlockersRepo(), makeEmployeesRepo());
  await expectStatus(ctrl.open(ACTOR_CTX, EMP, { kind: 'NOPE', reason: 'x'.repeat(25) }), 400);
});

test('400 when reason is shorter than 20 chars', async () => {
  const ctrl = new BlockersController(makeBlockersRepo(), makeEmployeesRepo());
  await expectStatus(ctrl.open(ACTOR_CTX, EMP, { kind: 'PIP', reason: 'too short' }), 400);
});

test('400 when reason is longer than 4000 chars', async () => {
  const ctrl = new BlockersController(makeBlockersRepo(), makeEmployeesRepo());
  await expectStatus(ctrl.open(ACTOR_CTX, EMP, { kind: 'PIP', reason: 'x'.repeat(4001) }), 400);
});

test('404 when employee is not found in actor org (cross-org probe blocked)', async () => {
  const ctrl = new BlockersController(makeBlockersRepo(), makeEmployeesRepo({ findResult: null }));
  await expectStatus(
    ctrl.open(ACTOR_CTX, EMP, { kind: 'PIP', reason: 'x'.repeat(25) }),
    404,
  );
});

test('409 when a duplicate active blocker exists for the (employee, kind) pair', async () => {
  // Faithfully model the P2002 the partial unique index produces.
  const { Prisma } = await import('@prisma/client');
  const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['employee_id', 'kind'] },
  });
  const ctrl = new BlockersController(
    makeBlockersRepo({ openThrows: p2002 }),
    makeEmployeesRepo(),
  );
  await expectStatus(
    ctrl.open(ACTOR_CTX, EMP, { kind: 'PIP', reason: 'x'.repeat(25) }),
    409,
  );
});

test('201 on happy path; returns the created blocker', async () => {
  const ctrl = new BlockersController(makeBlockersRepo(), makeEmployeesRepo());
  // The controller returns the row directly — Nest's @HttpCode(201)
  // sets the status. We don't have a real HTTP layer here, just assert
  // the result shape.
  const result = await ctrl.open(ACTOR_CTX, EMP, {
    kind: 'PIP',
    reason: 'Active PIP — see HR ticket TKT-12345',
  });
  assert.equal(result.id, BLOCKER);
});

// ── PATCH /v1/blockers/:id/resolve ─────────────────────────────────

test('resolve: 400 when blocker id is not a UUID', async () => {
  const ctrl = new BlockersController(makeBlockersRepo(), makeEmployeesRepo());
  await expectStatus(ctrl.resolve(ACTOR_CTX, 'not-a-uuid', {}), 400);
});

test('resolve: 409 when blocker is already resolved or does not exist', async () => {
  const err = new BlockerAlreadyResolvedError(BLOCKER);
  const ctrl = new BlockersController(
    makeBlockersRepo({ resolveThrows: err }),
    makeEmployeesRepo(),
  );
  await expectStatus(ctrl.resolve(ACTOR_CTX, BLOCKER, {}), 409);
});

test('resolve: 400 when resolutionNote is not a string', async () => {
  const ctrl = new BlockersController(makeBlockersRepo(), makeEmployeesRepo());
  await expectStatus(ctrl.resolve(ACTOR_CTX, BLOCKER, { resolutionNote: 42 }), 400);
});

test('resolve: 400 when resolutionNote is too long', async () => {
  const ctrl = new BlockersController(makeBlockersRepo(), makeEmployeesRepo());
  await expectStatus(
    ctrl.resolve(ACTOR_CTX, BLOCKER, { resolutionNote: 'x'.repeat(4001) }),
    400,
  );
});

test('resolve: 200 on happy path with valid note', async () => {
  const ctrl = new BlockersController(makeBlockersRepo(), makeEmployeesRepo());
  const result = await ctrl.resolve(ACTOR_CTX, BLOCKER, { resolutionNote: 'HR concluded successfully' });
  assert.equal(result.id, BLOCKER);
});

test('resolve: 200 on happy path with no note (resolutionNote omitted)', async () => {
  const ctrl = new BlockersController(makeBlockersRepo(), makeEmployeesRepo());
  const result = await ctrl.resolve(ACTOR_CTX, BLOCKER, {});
  assert.equal(result.id, BLOCKER);
});
