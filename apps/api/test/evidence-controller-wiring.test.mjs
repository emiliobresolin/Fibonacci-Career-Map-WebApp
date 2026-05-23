// Story 8-2 — EvidenceController wiring: routes mounted under the
// requirement-id path, every handler authenticated (no @Public), no
// role gate (any authenticated user can submit OWN evidence per PRD §3.1).

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { EvidenceController } = await import('../dist/evidence/evidence.controller.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

const HANDLERS = ['createUploadSlot', 'finalize'];

test('controller is mounted at v1/requirements/:requirementId/evidence', () => {
  const path = Reflect.getMetadata('path', EvidenceController);
  assert.equal(path, 'v1/requirements/:requirementId/evidence');
});

test('upload-slot handler is POST upload-slot returning 201', () => {
  const handler = EvidenceController.prototype.createUploadSlot;
  assert.ok(handler);
  assert.equal(Reflect.getMetadata('path', handler), 'upload-slot');
  // method metadata: 1 = POST in Nest's internal enum
  assert.equal(Reflect.getMetadata('method', handler), 1);
  // explicit 201 set via @HttpCode
  assert.equal(Reflect.getMetadata('__httpCode__', handler), 201);
});

test('finalize handler is POST finalize (default 201)', () => {
  const handler = EvidenceController.prototype.finalize;
  assert.ok(handler);
  assert.equal(Reflect.getMetadata('path', handler), 'finalize');
  assert.equal(Reflect.getMetadata('method', handler), 1);
});

test('no handler is @Public() — every route requires a tenant JWT', () => {
  for (const m of HANDLERS) {
    const handler = EvidenceController.prototype[m];
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler);
    assert.notEqual(isPublic, true, `${m} must require authentication`);
  }
});

test('no handler is @Roles-gated — any role can submit OWN evidence (PRD §3.1)', () => {
  // PRD §3.1: "Submit own evidence — EMPLOYEE / MANAGER / ADMIN all
  // allowed". Authorization is enforced inside the service by deriving
  // employee_id from actor.user_id; no role-level guard is needed at
  // the controller. A future change adding @Roles here would break
  // employees, so this test pins the absence.
  for (const m of HANDLERS) {
    const handler = EvidenceController.prototype[m];
    const roles = Reflect.getMetadata(ROLES_KEY, handler);
    assert.equal(roles, undefined, `${m} must NOT carry @Roles`);
  }
});
