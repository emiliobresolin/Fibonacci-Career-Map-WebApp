// Story 7-4 AC1: Requirements writes are ADMIN-only; reads
// authenticated-only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { RequirementsController } = await import('../dist/configuration/requirements.controller.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

const WRITE_METHODS = ['create', 'update', 'deactivate'];
const READ_METHODS = ['list', 'findOne'];

test('AC1: every write handler is gated by @Roles("ADMIN")', () => {
  for (const method of WRITE_METHODS) {
    const handler = RequirementsController.prototype[method];
    assert.ok(handler, `expected ${method} on RequirementsController`);
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), ['ADMIN']);
  }
});

test('AC1: read handlers are NOT @Roles-gated', () => {
  for (const method of READ_METHODS) {
    assert.equal(Reflect.getMetadata(ROLES_KEY, RequirementsController.prototype[method]), undefined);
  }
});

test('No handler is @Public()', () => {
  for (const method of [...READ_METHODS, ...WRITE_METHODS]) {
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, RequirementsController.prototype[method]), true);
  }
});

test('RequirementsController is NOT class-level @Public() or @Roles', () => {
  assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, RequirementsController), true);
  assert.equal(Reflect.getMetadata(ROLES_KEY, RequirementsController), undefined);
});

test('AC4: controller has NO DELETE handler that hard-deletes (only soft @Delete that maps to service.deactivate)', () => {
  // Belt-and-braces guard: ensure no method named "remove" or "destroy"
  // exists that could hard-delete. The Delete endpoint is named
  // "deactivate" on the controller to make the intent explicit.
  assert.equal(typeof RequirementsController.prototype.remove, 'undefined');
  assert.equal(typeof RequirementsController.prototype.destroy, 'undefined');
  assert.equal(typeof RequirementsController.prototype.deactivate, 'function');
});
