// Story 8-4 — EvidenceReviewController wiring: approve / reject
// PATCH routes are MANAGER + ADMIN gated, no @Public.

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { EvidenceReviewController } = await import('../dist/evidence/evidence-review.controller.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

const HANDLERS = ['approve', 'reject'];

test('controller is mounted at v1/evidence', () => {
  assert.equal(Reflect.getMetadata('path', EvidenceReviewController), 'v1/evidence');
});

for (const m of HANDLERS) {
  test(`${m} is PATCH :id/${m}`, () => {
    const handler = EvidenceReviewController.prototype[m];
    assert.ok(handler, `expected handler ${m}`);
    assert.equal(Reflect.getMetadata('path', handler), `:id/${m}`);
    // method 4 = PATCH in Nest's RequestMethod enum
    assert.equal(Reflect.getMetadata('method', handler), 4);
    // Explicit 200 via @HttpCode
    assert.equal(Reflect.getMetadata('__httpCode__', handler), 200);
  });

  test(`${m} is gated by @Roles(MANAGER, ADMIN)`, () => {
    const handler = EvidenceReviewController.prototype[m];
    const roles = Reflect.getMetadata(ROLES_KEY, handler);
    assert.ok(Array.isArray(roles));
    // EMPLOYEE must NOT be on the list — they only submit, not review.
    assert.deepEqual([...roles].sort(), ['ADMIN', 'MANAGER']);
  });

  test(`${m} is not @Public()`, () => {
    const handler = EvidenceReviewController.prototype[m];
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, handler), true);
  });
}
