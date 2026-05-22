// Story 7-5 AC1: Promotion-rule writes are ADMIN-only; reads
// authenticated-only. Also confirms there's NO DELETE handler (one
// rule per level — deletion would orphan the eligibility evaluator).

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { PromotionRulesController } = await import('../dist/configuration/promotion-rules.controller.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

const WRITE_METHODS = ['create', 'update'];
const READ_METHODS = ['findOne'];

test('AC1: every write handler is gated by @Roles("ADMIN")', () => {
  for (const method of WRITE_METHODS) {
    const handler = PromotionRulesController.prototype[method];
    assert.ok(handler, `expected ${method} on PromotionRulesController`);
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), ['ADMIN']);
  }
});

test('AC1: read handler is NOT @Roles-gated', () => {
  for (const method of READ_METHODS) {
    assert.equal(Reflect.getMetadata(ROLES_KEY, PromotionRulesController.prototype[method]), undefined);
  }
});

test('No handler is @Public()', () => {
  for (const method of [...READ_METHODS, ...WRITE_METHODS]) {
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, PromotionRulesController.prototype[method]), true);
  }
});

test('PromotionRulesController has NO DELETE handler (no delete/remove/destroy/deactivate method)', () => {
  // Guards against a future maintainer adding a DELETE that would
  // orphan the level's eligibility evaluator.
  assert.equal(typeof PromotionRulesController.prototype.delete, 'undefined');
  assert.equal(typeof PromotionRulesController.prototype.remove, 'undefined');
  assert.equal(typeof PromotionRulesController.prototype.destroy, 'undefined');
  assert.equal(typeof PromotionRulesController.prototype.deactivate, 'undefined');
});

test('PromotionRulesController is NOT class-level @Public() or @Roles', () => {
  assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, PromotionRulesController), true);
  assert.equal(Reflect.getMetadata(ROLES_KEY, PromotionRulesController), undefined);
});
