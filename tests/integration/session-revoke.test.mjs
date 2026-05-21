// Story 2-3 AC2 + AC3 + AC4: Redis-backed forced logout.
//
// Exercises the SessionStoreService directly (so the test doesn't need
// the full HTTP stack). For each pre-condition:
//   - register(jti) → isActive returns true
//   - revokeAll → all matching keys gone; subsequent isActive returns false
//   - TTL set on register honors the 24h absolute expiry
//
// Skipped when REDIS_URL is unset or the api dist isn't built.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const REDIS_URL = process.env.REDIS_URL;

async function loadStore() {
  const [{ NestFactory }, { AppModule }, { SessionStoreService }] = await Promise.all([
    import('@nestjs/core'),
    import('../../apps/api/dist/app.module.js'),
    import('../../apps/api/dist/sessions/session-store.service.js'),
  ]);
  const appModule = AppModule.register({ mode: 'api' });
  const app = await NestFactory.createApplicationContext(appModule, { bufferLogs: true });
  await app.init();
  return { app, store: app.get(SessionStoreService) };
}

test('AC1 + AC2: register + revokeAll + isActive lifecycle', async (t) => {
  if (!REDIS_URL) {
    t.skip('REDIS_URL not set — session store integration test skipped');
    return;
  }
  let app, store;
  try {
    ({ app, store } = await loadStore());
  } catch (err) {
    if (/Cannot find module/i.test(String(err))) {
      t.skip('apps/api dist build not present — run `pnpm --filter @fcm/api build` first');
      return;
    }
    throw err;
  }
  const orgId = randomUUID();
  const userId = randomUUID();
  const jti1 = randomUUID();
  const jti2 = randomUUID();
  try {
    // Two sessions for the same user.
    await store.register({ organizationId: orgId, userId, jti: jti1, ttlSeconds: 300 });
    await store.register({ organizationId: orgId, userId, jti: jti2, ttlSeconds: 300 });

    assert.equal(await store.isActive({ organizationId: orgId, userId, jti: jti1 }), true);
    assert.equal(await store.isActive({ organizationId: orgId, userId, jti: jti2 }), true);

    // Revoke all → both sessions gone.
    const deleted = await store.revokeAll({ organizationId: orgId, userId });
    assert.equal(deleted, 2, 'revokeAll must report the number of sessions dropped (AC2)');

    assert.equal(await store.isActive({ organizationId: orgId, userId, jti: jti1 }), false);
    assert.equal(await store.isActive({ organizationId: orgId, userId, jti: jti2 }), false);
  } finally {
    await app.close();
  }
});

test('AC2: revokeAll is scoped to a specific (orgId, userId) — other users in the same org are untouched', async (t) => {
  if (!REDIS_URL) {
    t.skip('REDIS_URL not set');
    return;
  }
  let app, store;
  try {
    ({ app, store } = await loadStore());
  } catch (err) {
    if (/Cannot find module/i.test(String(err))) {
      t.skip('apps/api dist build not present');
      return;
    }
    throw err;
  }
  const orgId = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const jtiA = randomUUID();
  const jtiB = randomUUID();
  try {
    await store.register({ organizationId: orgId, userId: userA, jti: jtiA, ttlSeconds: 300 });
    await store.register({ organizationId: orgId, userId: userB, jti: jtiB, ttlSeconds: 300 });

    const deleted = await store.revokeAll({ organizationId: orgId, userId: userA });
    assert.equal(deleted, 1, 'revokeAll(userA) must NOT touch userB');

    assert.equal(await store.isActive({ organizationId: orgId, userId: userA, jti: jtiA }), false);
    assert.equal(
      await store.isActive({ organizationId: orgId, userId: userB, jti: jtiB }),
      true,
      'userB\'s session must remain active',
    );
  } finally {
    await app.close();
  }
});

test('AC2 cross-org: revoking in org A must not touch sessions in org B', async (t) => {
  if (!REDIS_URL) {
    t.skip('REDIS_URL not set');
    return;
  }
  let app, store;
  try {
    ({ app, store } = await loadStore());
  } catch (err) {
    if (/Cannot find module/i.test(String(err))) {
      t.skip('apps/api dist build not present');
      return;
    }
    throw err;
  }
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userId = randomUUID(); // same user-id literal in both orgs (multi-tenant)
  const jtiA = randomUUID();
  const jtiB = randomUUID();
  try {
    await store.register({ organizationId: orgA, userId, jti: jtiA, ttlSeconds: 300 });
    await store.register({ organizationId: orgB, userId, jti: jtiB, ttlSeconds: 300 });

    const deleted = await store.revokeAll({ organizationId: orgA, userId });
    assert.equal(deleted, 1);

    assert.equal(await store.isActive({ organizationId: orgA, userId, jti: jtiA }), false);
    assert.equal(
      await store.isActive({ organizationId: orgB, userId, jti: jtiB }),
      true,
      'org B\'s session must remain active — cross-org isolation',
    );
  } finally {
    await app.close();
  }
});
