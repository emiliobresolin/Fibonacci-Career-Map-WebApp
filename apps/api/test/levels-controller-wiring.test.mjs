// Story 7-2 AC1: confirm Levels CRUD writes are ADMIN-only and reads
// remain authenticated-only (same posture as Career Tracks per 7-1).

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { LevelsController } = await import('../dist/configuration/levels.controller.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

const WRITE_METHODS = ['create', 'update', 'deactivate'];
const READ_METHODS = ['list', 'findOne'];

test('AC1: every write handler is gated by @Roles("ADMIN")', () => {
  for (const method of WRITE_METHODS) {
    const handler = LevelsController.prototype[method];
    assert.ok(handler, `expected ${method} on LevelsController`);
    const roles = Reflect.getMetadata(ROLES_KEY, handler);
    assert.deepEqual(
      roles,
      ['ADMIN'],
      `${method} must be @Roles("ADMIN") — writes must NOT be open to non-admins`,
    );
  }
});

test('AC1: read handlers are NOT @Roles-gated (any authenticated role passes)', () => {
  for (const method of READ_METHODS) {
    const handler = LevelsController.prototype[method];
    const roles = Reflect.getMetadata(ROLES_KEY, handler);
    assert.equal(
      roles,
      undefined,
      `${method} must NOT have @Roles — reads are open to all authenticated roles`,
    );
  }
});

test('No handler is @Public() (every route requires a tenant JWT)', () => {
  for (const method of [...READ_METHODS, ...WRITE_METHODS]) {
    const handler = LevelsController.prototype[method];
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler);
    assert.notEqual(isPublic, true, `${method} must require authentication`);
  }
});

test('LevelsController is NOT class-level @Public() or @Roles', () => {
  assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, LevelsController), true);
  assert.equal(Reflect.getMetadata(ROLES_KEY, LevelsController), undefined);
});
