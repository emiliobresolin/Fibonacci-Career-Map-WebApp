// @Roles decorator surface tests — Story 2-4 AC2.
// Asserts the decorator validates known roles at module-load time
// (so a typo is caught when the controller is imported, not when a
// request lands and produces a 500).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { Roles, ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { ROLES } = await import('../dist/auth/auth.types.js');

test('ROLES enumerates the three documented roles', () => {
  assert.deepEqual([...ROLES].sort(), ['ADMIN', 'EMPLOYEE', 'MANAGER']);
});

test('Roles() accepts a single known role', () => {
  // Just exercising the decorator factory — should not throw.
  assert.doesNotThrow(() => Roles('ADMIN'));
});

test('Roles() accepts multiple known roles', () => {
  assert.doesNotThrow(() => Roles('MANAGER', 'ADMIN'));
});

test('Roles() throws synchronously on an unknown role', () => {
  assert.throws(() => Roles('SUPERUSER'), /@Roles received unknown role: SUPERUSER/);
});

test('ROLES_KEY is the stable metadata key', () => {
  assert.equal(ROLES_KEY, 'auth:roles');
});
