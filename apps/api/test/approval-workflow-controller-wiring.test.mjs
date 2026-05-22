// Story 7-7 AC1: ApprovalWorkflow endpoints are ADMIN-only (read + write).

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { ApprovalWorkflowController } = await import('../dist/configuration/approval-workflow.controller.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

const ALL_METHODS = ['getApprovalWorkflow', 'updateApprovalWorkflow'];

test('AC1: every handler is gated by @Roles("ADMIN")', () => {
  for (const method of ALL_METHODS) {
    const handler = ApprovalWorkflowController.prototype[method];
    assert.ok(handler, `expected ${method} on ApprovalWorkflowController`);
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), ['ADMIN']);
  }
});

test('No handler is @Public()', () => {
  for (const method of ALL_METHODS) {
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, ApprovalWorkflowController.prototype[method]), true);
  }
});

test('ApprovalWorkflowController is NOT class-level @Public() or @Roles', () => {
  assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, ApprovalWorkflowController), true);
  assert.equal(Reflect.getMetadata(ROLES_KEY, ApprovalWorkflowController), undefined);
});

test('F7-7a deferral: no per-level override handler yet — controller only exposes org-level surface', () => {
  // Guards against a future maintainer adding a per-level handler
  // without also landing the schema migration.
  for (const ghost of ['getLevelOverride', 'updateLevelOverride', 'getByLevel', 'updateByLevel']) {
    assert.equal(typeof ApprovalWorkflowController.prototype[ghost], 'undefined', `${ghost} should not exist until F7-7a`);
  }
});
