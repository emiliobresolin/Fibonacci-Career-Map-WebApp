// Story 7-3 AC1: Layers CRUD writes are ADMIN-only; reads are
// authenticated-only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { LayersController } = await import('../dist/configuration/layers.controller.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

const WRITE_METHODS = ['create', 'update', 'remove'];
const READ_METHODS = ['list', 'findOne'];

test('AC1: every write handler is gated by @Roles("ADMIN")', () => {
  for (const method of WRITE_METHODS) {
    const handler = LayersController.prototype[method];
    assert.ok(handler, `expected ${method} on LayersController`);
    const roles = Reflect.getMetadata(ROLES_KEY, handler);
    assert.deepEqual(roles, ['ADMIN'], `${method} must be @Roles("ADMIN")`);
  }
});

test('AC1: read handlers are NOT @Roles-gated', () => {
  for (const method of READ_METHODS) {
    const handler = LayersController.prototype[method];
    const roles = Reflect.getMetadata(ROLES_KEY, handler);
    assert.equal(roles, undefined, `${method} must NOT have @Roles`);
  }
});

test('No handler is @Public() (every route requires a tenant JWT)', () => {
  for (const method of [...READ_METHODS, ...WRITE_METHODS]) {
    const handler = LayersController.prototype[method];
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, handler), true);
  }
});

test('LayersController is NOT class-level @Public() or @Roles', () => {
  assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, LayersController), true);
  assert.equal(Reflect.getMetadata(ROLES_KEY, LayersController), undefined);
});
