// Story 6-1 AC2: InternalProvisioningGuard contract.
//
// The guard gates POST /v1/organizations — bootstrap tooling, not
// tenant Admins. We hand-stub ExecutionContext + ConfigService to
// avoid booting Nest; the guard's only collaborator is ConfigService.
//
// Coverage:
//   • 401 when env token unset (closed-fail)
//   • 401 when X-Internal-Token missing
//   • 401 when token wrong
//   • passes (true) when token matches
//   • timingSafeEqual: a same-length-but-wrong token does NOT
//     short-circuit, AND a different-length wrong token still goes
//     through a no-op compare (we can't assert wall-clock parity in
//     a unit test, but we CAN assert both branches surface as 401).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { InternalProvisioningGuard } = await import(
  '../dist/organizations/internal-provisioning.guard.js'
);

const VALID_TOKEN = 'a'.repeat(40); // ≥32 chars to satisfy env Zod min.

function makeConfig(token) {
  return { get: () => token };
}

function makeCtx({ token, type = 'http' } = {}) {
  const req = { headers: {} };
  if (token !== undefined) req.headers['x-internal-token'] = token;
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => req }),
  };
}

async function expectStatus(promise, expectedStatus) {
  try {
    const v = await promise;
    assert.fail(`expected ${expectedStatus}, got resolved value ${JSON.stringify(v)}`);
  } catch (err) {
    assert.equal(
      err.getStatus?.(),
      expectedStatus,
      `expected ${expectedStatus}, got ${err.getStatus?.()} (${err.message})`,
    );
  }
}

test('AC2: 401 when INTERNAL_PROVISIONING_TOKEN env is unset (closed-fail)', async () => {
  const guard = new InternalProvisioningGuard(makeConfig(undefined));
  await expectStatus(
    Promise.resolve().then(() => guard.canActivate(makeCtx({ token: VALID_TOKEN }))),
    401,
  );
});

test('AC2: 401 when X-Internal-Token header is missing', async () => {
  const guard = new InternalProvisioningGuard(makeConfig(VALID_TOKEN));
  await expectStatus(
    Promise.resolve().then(() => guard.canActivate(makeCtx({ token: undefined }))),
    401,
  );
});

test('AC2: 401 when X-Internal-Token is wrong but same length', async () => {
  const guard = new InternalProvisioningGuard(makeConfig(VALID_TOKEN));
  const wrong = 'b'.repeat(VALID_TOKEN.length);
  await expectStatus(
    Promise.resolve().then(() => guard.canActivate(makeCtx({ token: wrong }))),
    401,
  );
});

test('AC2: 401 when X-Internal-Token is wrong AND different length', async () => {
  const guard = new InternalProvisioningGuard(makeConfig(VALID_TOKEN));
  // Different-length branch — exercises the timingSafeEqual no-op
  // compare path so a regression that returns early on length
  // mismatch will trip an assertion in the body of the guard.
  await expectStatus(
    Promise.resolve().then(() => guard.canActivate(makeCtx({ token: 'tooshort' }))),
    401,
  );
});

test('AC2: passes (true) when X-Internal-Token matches env', () => {
  const guard = new InternalProvisioningGuard(makeConfig(VALID_TOKEN));
  const result = guard.canActivate(makeCtx({ token: VALID_TOKEN }));
  assert.equal(result, true);
});

test('AC2: header value may be array-typed (Node normalizes duplicates)', () => {
  // Express normalizes duplicate request headers into a string[] in some
  // configurations. The guard picks the first entry — confirming a
  // common edge case rather than reading `undefined` off an array.
  const guard = new InternalProvisioningGuard(makeConfig(VALID_TOKEN));
  const req = { headers: { 'x-internal-token': [VALID_TOKEN, 'b'] } };
  const ctx = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  };
  assert.equal(guard.canActivate(ctx), true);
});

test('AC2: non-HTTP transport surfaces as 401 (closed-fail)', async () => {
  const guard = new InternalProvisioningGuard(makeConfig(VALID_TOKEN));
  await expectStatus(
    Promise.resolve().then(() => guard.canActivate(makeCtx({ token: VALID_TOKEN, type: 'rpc' }))),
    401,
  );
});
