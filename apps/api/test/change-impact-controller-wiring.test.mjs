// Story 7-8 AC1: preview-impact is ADMIN-only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { ChangeImpactController } = await import('../dist/configuration/change-impact.controller.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

test('AC1: previewImpact is gated by @Roles("ADMIN")', () => {
  const handler = ChangeImpactController.prototype.previewImpact;
  assert.ok(handler);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), ['ADMIN']);
});

test('previewImpact is NOT @Public()', () => {
  const handler = ChangeImpactController.prototype.previewImpact;
  assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, handler), true);
});

test('ChangeImpactController is NOT class-level @Public() or @Roles', () => {
  assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, ChangeImpactController), true);
  assert.equal(Reflect.getMetadata(ROLES_KEY, ChangeImpactController), undefined);
});

test('AC2: ChangeImpactController has NO write handlers (read-only preview)', () => {
  // Belt-and-braces guard against a future maintainer adding a
  // "commit" or "apply" handler that mutates state from this endpoint.
  for (const ghost of ['create', 'update', 'remove', 'delete', 'commit', 'apply']) {
    assert.equal(typeof ChangeImpactController.prototype[ghost], 'undefined', `${ghost} should not exist — this controller is preview-only`);
  }
});
