// Layer-3 RLS helpers (Story 2-6) — pure unit tests against the helper
// surface. DB-integration tests (cross-org isolation + non-UUID rejection)
// live in `rls-integration.test.mjs` and are gated by DATABASE_URL.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { isUuid, withOrgScope, RlsScope, RlsInvalidOrgIdError } = await import(
  '../dist/prisma/rls.helpers.js'
);

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const ANOTHER_UUID = '22222222-2222-2222-2222-222222222222';

// ── isUuid ───────────────────────────────────────────────────────────

test('isUuid accepts canonical UUID strings', () => {
  assert.equal(isUuid(VALID_UUID), true);
  assert.equal(isUuid('FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'), true); // case-insensitive
});

test('isUuid rejects non-UUID strings', () => {
  assert.equal(isUuid(''), false);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid('1111-2222'), false);
  assert.equal(isUuid('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'), false);
});

test('isUuid rejects non-string inputs', () => {
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(undefined), false);
  assert.equal(isUuid(123), false);
  assert.equal(isUuid({}), false);
});

// ── withOrgScope — pure helper unit test with a mock prisma ──────────

test('withOrgScope opens a $transaction and SETs app.current_org_id (AC2)', async () => {
  const captured = { sql: null, params: null, fnTx: null };
  const mockPrisma = {
    $transaction: async (fn) => {
      const tx = {
        $executeRaw: (strings, ...params) => {
          // Prisma's tagged template returns a callable result that's
          // awaitable; here we just record the call and resolve.
          captured.sql = strings.join('?');
          captured.params = params;
          return Promise.resolve(0);
        },
      };
      return fn(tx);
    },
  };
  const result = await withOrgScope(mockPrisma, VALID_UUID, async (tx) => {
    captured.fnTx = tx;
    return { hit: true };
  });
  assert.deepEqual(result, { hit: true });
  assert.match(captured.sql, /set_config\('app\.current_org_id'/);
  assert.deepEqual(captured.params, [VALID_UUID]);
  assert.ok(captured.fnTx, 'fn must be invoked with the transaction client');
});

test('withOrgScope rejects non-UUID organizationId BEFORE opening a transaction (AC4)', async () => {
  let txCalled = false;
  const mockPrisma = {
    $transaction: async () => {
      txCalled = true;
    },
  };
  await assert.rejects(
    () => withOrgScope(mockPrisma, 'not-a-uuid', async () => undefined),
    RlsInvalidOrgIdError,
  );
  assert.equal(txCalled, false, 'transaction must not be opened for invalid uuid');
});

test('withOrgScope propagates errors thrown inside the callback (transaction rolls back)', async () => {
  const mockPrisma = {
    $transaction: async (fn) => {
      const tx = { $executeRaw: () => Promise.resolve(0) };
      return fn(tx);
    },
  };
  await assert.rejects(
    () => withOrgScope(mockPrisma, VALID_UUID, async () => {
      throw new Error('domain rejection');
    }),
    /domain rejection/,
  );
});

test('RlsInvalidOrgIdError truncates oversized bad-value strings to 64 chars', () => {
  const huge = 'x'.repeat(10_000);
  const err = new RlsInvalidOrgIdError(huge);
  assert.equal(err.badValue.length, 64);
  assert.equal(err.code, 'RLS_INVALID_ORG_ID');
});

// ── RlsScope (AsyncLocalStorage) ────────────────────────────────────

test('RlsScope.run associates orgId with the async frame; .current() reads it back', () => {
  assert.equal(RlsScope.current(), undefined, 'no scope outside .run');
  RlsScope.run(VALID_UUID, () => {
    assert.equal(RlsScope.current(), VALID_UUID);
  });
  assert.equal(RlsScope.current(), undefined, 'scope cleared after .run returns');
});

test('RlsScope nesting picks up the inner orgId, restores outer on exit', () => {
  RlsScope.run(VALID_UUID, () => {
    assert.equal(RlsScope.current(), VALID_UUID);
    RlsScope.run(ANOTHER_UUID, () => {
      assert.equal(RlsScope.current(), ANOTHER_UUID);
    });
    assert.equal(RlsScope.current(), VALID_UUID, 'outer scope restored');
  });
});

test('RlsScope.run survives async/await — the scope follows the promise chain', async () => {
  await RlsScope.run(VALID_UUID, async () => {
    await Promise.resolve();
    assert.equal(RlsScope.current(), VALID_UUID);
    await new Promise((r) => setImmediate(r));
    assert.equal(RlsScope.current(), VALID_UUID);
  });
});

test('RlsScope.run rejects a non-UUID input with RlsInvalidOrgIdError (AC4)', () => {
  assert.throws(() => RlsScope.run('not-a-uuid', () => undefined), RlsInvalidOrgIdError);
});
