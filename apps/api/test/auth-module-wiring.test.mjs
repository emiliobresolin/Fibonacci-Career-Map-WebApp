// Smoke test that the global Layer-1 AuthGuard is wired into the module
// graph via APP_GUARD. Without this, a regression that removed the
// provider would silently open every authenticated route and the
// guard-unit tests would still pass.
//
// We can't easily boot Nest without DB/Redis, so we inspect the module's
// design-time metadata directly via Reflect — which is what Nest itself
// uses at boot. If the @Module decorator's `providers` array loses the
// APP_GUARD entry, this test fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Side-effect: importing reflect-metadata installs the polyfill.
await import('reflect-metadata');

const { AuthModule } = await import('../dist/auth/auth.module.js');
const { JwtAuthGuard } = await import('../dist/auth/auth.guard.js');
const { APP_GUARD } = await import('@nestjs/core');

test('AuthModule registers JwtAuthGuard as a global APP_GUARD provider', () => {
  // Nest stores the @Module options on the class as 'providers' via the
  // metadata key 'providers'. Read it back and assert the APP_GUARD entry
  // exists and binds to JwtAuthGuard.
  const providers = Reflect.getMetadata('providers', AuthModule);
  assert.ok(Array.isArray(providers), 'AuthModule.providers must be an array');

  const appGuardProvider = providers.find(
    (p) => p && typeof p === 'object' && p.provide === APP_GUARD,
  );
  assert.ok(appGuardProvider, 'AuthModule must register an APP_GUARD provider');
  assert.equal(
    appGuardProvider.useClass,
    JwtAuthGuard,
    'APP_GUARD must bind to JwtAuthGuard',
  );
});
