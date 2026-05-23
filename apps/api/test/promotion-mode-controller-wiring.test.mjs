// Story 7-10 — Promotion-mode endpoints are ADMIN-only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { PromotionModeController } = await import('../dist/configuration/promotion-mode.controller.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

const ALL = ['getPromotionMode', 'transitionPromotionMode'];

test('every handler is @Roles("ADMIN")', () => {
  for (const m of ALL) {
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PromotionModeController.prototype[m]), ['ADMIN']);
  }
});

test('no handler is @Public()', () => {
  for (const m of ALL) {
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, PromotionModeController.prototype[m]), true);
  }
});

test('PromotionModeController is NOT class-level @Public() or @Roles', () => {
  assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, PromotionModeController), true);
  assert.equal(Reflect.getMetadata(ROLES_KEY, PromotionModeController), undefined);
});
