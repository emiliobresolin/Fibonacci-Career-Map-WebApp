// Story 6-4: confirm the bootstrap endpoint's auth decoration matches the
// security contract.
//
// The bootstrap endpoint (POST /v1/organizations/bootstrap) is reachable
// without a tenant JWT (the org has no users yet at call time). Two pieces
// of metadata make that safe:
//   • @Public()                  — short-circuits the global JwtAuthGuard
//   • @UseGuards(InternalProvisioningGuard) — replaces it with a
//                                   shared-secret check on X-Internal-Token
//
// A regression that drops EITHER one is a security incident: dropping
// @Public() locks operators out (cannot get a JWT before users exist),
// dropping @UseGuards opens an unauthenticated org-creation endpoint to
// the public internet. Pin both at the metadata layer so a future refactor
// catches the drift before it ships.

import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('reflect-metadata');

const { OrganizationsController } = await import(
  '../dist/organizations/organizations.controller.js'
);
const { InternalProvisioningGuard } = await import(
  '../dist/organizations/internal-provisioning.guard.js'
);
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');
const { GUARDS_METADATA } = await import('@nestjs/common/constants.js');

// Both endpoints (`create` and `createWithBootstrap`) MUST carry the same
// pair of decorators. Drift between them is a smell; the bootstrap surface
// inherits everything the 6-1 surface needs.
const ENDPOINTS = ['create', 'createWithBootstrap'];

test('both org-provisioning endpoints carry @Public() (JwtAuthGuard opt-out)', () => {
  for (const method of ENDPOINTS) {
    const handler = OrganizationsController.prototype[method];
    assert.ok(handler, `expected method ${method} on OrganizationsController`);
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler);
    assert.equal(
      isPublic,
      true,
      `${method} must be @Public() so the global JwtAuthGuard short-circuits`,
    );
  }
});

test('both org-provisioning endpoints carry @UseGuards(InternalProvisioningGuard)', () => {
  for (const method of ENDPOINTS) {
    const handler = OrganizationsController.prototype[method];
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
    assert.ok(
      guards.includes(InternalProvisioningGuard),
      `${method} must be gated by InternalProvisioningGuard — got ${guards.map((g) => g.name ?? '?').join(', ') || 'none'}`,
    );
  }
});

test('@Public() is NOT class-level (per-handler opt-out, Story 2-4 follow-up)', () => {
  // The Story 6-1 controller comment pins this: class-level @Public would
  // silently grant the opt-out to any future handler added here. Per-
  // handler is the safer default — and matches the Story 2-4 closed-by-
  // default contract.
  const classLevelPublic = Reflect.getMetadata(IS_PUBLIC_KEY, OrganizationsController);
  assert.notEqual(
    classLevelPublic,
    true,
    'OrganizationsController must NOT carry class-level @Public()',
  );
});
