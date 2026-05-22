// Story 7-1 AC1: confirm Career Tracks CRUD writes are ADMIN-only.
// Reads (GET list + GET by-id) are authenticated-only (no @Roles) so
// MANAGER/EMPLOYEE can resolve track names for UI rendering.

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { CareerTracksController } = await import(
  '../dist/configuration/career-tracks.controller.js'
);
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

const WRITE_METHODS = ['create', 'update', 'deactivate'];
const READ_METHODS = ['list', 'findOne'];

test('AC1: every write handler is gated by @Roles("ADMIN")', () => {
  for (const method of WRITE_METHODS) {
    const handler = CareerTracksController.prototype[method];
    assert.ok(handler, `expected ${method} on CareerTracksController`);
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
    const handler = CareerTracksController.prototype[method];
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
    const handler = CareerTracksController.prototype[method];
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler);
    assert.notEqual(isPublic, true, `${method} must require authentication`);
  }
});

test('CareerTracksController is NOT class-level @Public() or @Roles', () => {
  assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, CareerTracksController), true);
  assert.equal(Reflect.getMetadata(ROLES_KEY, CareerTracksController), undefined);
});
