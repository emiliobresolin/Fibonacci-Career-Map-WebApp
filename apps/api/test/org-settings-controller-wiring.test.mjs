// Story 7-6 AC1: Visibility endpoints are ADMIN-only (both read and write).

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { OrgSettingsController } = await import('../dist/configuration/org-settings.controller.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

const ALL_METHODS = ['getVisibility', 'updateVisibility'];

test('AC1: every handler is gated by @Roles("ADMIN") (read AND write — visibility is admin-only by AC)', () => {
  for (const method of ALL_METHODS) {
    const handler = OrgSettingsController.prototype[method];
    assert.ok(handler, `expected ${method} on OrgSettingsController`);
    assert.deepEqual(
      Reflect.getMetadata(ROLES_KEY, handler),
      ['ADMIN'],
      `${method} must be @Roles("ADMIN") — visibility surface is admin-only per AC1`,
    );
  }
});

test('No handler is @Public()', () => {
  for (const method of ALL_METHODS) {
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, OrgSettingsController.prototype[method]), true);
  }
});

test('OrgSettingsController is NOT class-level @Public() or @Roles', () => {
  assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, OrgSettingsController), true);
  assert.equal(Reflect.getMetadata(ROLES_KEY, OrgSettingsController), undefined);
});
