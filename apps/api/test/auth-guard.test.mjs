// Layer-1 AuthGuard contract test (Story 2-4 AC4).
//
// Verifies the three AC outcomes against the guard class directly:
//   • 401 on missing / malformed / invalid token
//   • 403 on role mismatch
//   • passes (canActivate → true) on matched role
//
// We construct the guard with hand-stubbed dependencies (Reflector,
// JwtService, SessionStoreService) and feed it a fake ExecutionContext.
// No NestJS app boot is required — keeps the test sub-100ms and removes
// the need for @nestjs/testing in the toolchain.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { JwtAuthGuard } = await import('../dist/auth/auth.guard.js');
const { ROLES_KEY } = await import('../dist/auth/roles.decorator.js');
const { IS_PUBLIC_KEY } = await import('../dist/auth/public.decorator.js');

// ── Test fixtures ────────────────────────────────────────────────────

function makeReflector({ isPublic = false, roles = undefined } = {}) {
  return {
    getAllAndOverride(key /* , targets */) {
      if (key === IS_PUBLIC_KEY) return isPublic || undefined;
      if (key === ROLES_KEY) return roles;
      return undefined;
    },
  };
}

function makeJwt({ verify = async () => ({ sub: 'u1', org: 'o1', role: 'EMPLOYEE' }) } = {}) {
  return { verifyAccess: verify };
}

function makeSessions({ active = true } = {}) {
  return { isActive: async () => active };
}

function makeContext({ authorization }) {
  const req = { headers: {} };
  if (authorization !== undefined) req.headers.authorization = authorization;
  return {
    getType: () => 'http',
    getHandler: () => () => {},
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
    _request: req,
  };
}

function build({ reflector, jwt, sessions } = {}) {
  return new JwtAuthGuard(
    reflector ?? makeReflector(),
    jwt ?? makeJwt(),
    sessions ?? makeSessions(),
  );
}

async function expectStatus(promise, expectedStatus) {
  try {
    await promise;
    assert.fail(`expected exception with status ${expectedStatus}, got resolved value`);
  } catch (err) {
    assert.equal(err.getStatus?.(), expectedStatus, `expected ${expectedStatus}, got ${err.getStatus?.()}`);
  }
}

// ── AC1 / AC4 — 401 paths ────────────────────────────────────────────

test('AC4: returns 401 when Authorization header is missing', async () => {
  const guard = build();
  const ctx = makeContext({ authorization: undefined });
  await expectStatus(guard.canActivate(ctx), 401);
});

test('AC4: returns 401 when Authorization header does not start with "Bearer "', async () => {
  const guard = build();
  const ctx = makeContext({ authorization: 'Basic dXNlcjpwYXNz' });
  await expectStatus(guard.canActivate(ctx), 401);
});

test('AC4: accepts "bearer" scheme case-insensitively (RFC 6750 §2.1)', async () => {
  const guard = build({
    jwt: makeJwt({ verify: async () => ({ sub: 'u1', org: 'o1', role: 'EMPLOYEE' }) }),
  });
  const ctx = makeContext({ authorization: 'bearer abc.def.ghi' });
  assert.equal(await guard.canActivate(ctx), true);
});

test('AC4: returns 401 when bearer token is empty', async () => {
  const guard = build();
  const ctx = makeContext({ authorization: 'Bearer   ' });
  await expectStatus(guard.canActivate(ctx), 401);
});

test('AC4: returns 401 when JwtService.verifyAccess rejects', async () => {
  const guard = build({
    jwt: makeJwt({
      verify: async () => {
        throw new Error('jwt expired');
      },
    }),
  });
  const ctx = makeContext({ authorization: 'Bearer abc.def.ghi' });
  await expectStatus(guard.canActivate(ctx), 401);
});

test('AC4: returns 401 when session jti is no longer active (forced logout)', async () => {
  const guard = build({
    jwt: makeJwt({
      verify: async () => ({ sub: 'u1', org: 'o1', role: 'EMPLOYEE', jti: 'j1' }),
    }),
    sessions: makeSessions({ active: false }),
  });
  const ctx = makeContext({ authorization: 'Bearer abc' });
  await expectStatus(guard.canActivate(ctx), 401);
});

// ── AC2 / AC4 — 403 path ─────────────────────────────────────────────

test('AC4: returns 403 when actor role is not in @Roles allow-list', async () => {
  const guard = build({
    reflector: makeReflector({ roles: ['ADMIN'] }),
    jwt: makeJwt({
      verify: async () => ({ sub: 'u1', org: 'o1', role: 'EMPLOYEE' }),
    }),
  });
  const ctx = makeContext({ authorization: 'Bearer abc' });
  await expectStatus(guard.canActivate(ctx), 403);
});

// ── AC1 / AC4 — happy path ───────────────────────────────────────────

test('AC4: returns true + populates req.user when token + role match', async () => {
  const guard = build({
    reflector: makeReflector({ roles: ['MANAGER', 'ADMIN'] }),
    jwt: makeJwt({
      verify: async () => ({ sub: 'u1', org: 'o1', role: 'ADMIN', name: 'Alice Admin', jti: 'j1' }),
    }),
  });
  const ctx = makeContext({ authorization: 'Bearer abc' });
  const result = await guard.canActivate(ctx);
  assert.equal(result, true);
  // AC1 + Story 2-5: request.user populated with the documented shape
  // including display_name from the OIDC `name` claim.
  assert.deepEqual(ctx._request.user, {
    user_id: 'u1',
    organization_id: 'o1',
    role: 'ADMIN',
    display_name: 'Alice Admin',
    jti: 'j1',
  });
});

test('Story 2-5: tokens without the `name` claim get an empty display_name', async () => {
  const guard = build({
    jwt: makeJwt({
      verify: async () => ({ sub: 'u1', org: 'o1', role: 'EMPLOYEE' }), // no `name`
    }),
  });
  const ctx = makeContext({ authorization: 'Bearer abc' });
  assert.equal(await guard.canActivate(ctx), true);
  assert.equal(ctx._request.user.display_name, '');
});

test('AC2: no @Roles annotation → any authenticated role passes', async () => {
  const guard = build({
    reflector: makeReflector({ roles: undefined }),
    jwt: makeJwt({
      verify: async () => ({ sub: 'u1', org: 'o1', role: 'EMPLOYEE' }),
    }),
  });
  const ctx = makeContext({ authorization: 'Bearer abc' });
  assert.equal(await guard.canActivate(ctx), true);
});

test('@Public() short-circuits — no Authorization header required', async () => {
  // Use a jwt stub that would throw to confirm the guard does not call
  // verifyAccess on the public path.
  const jwtCalls = { count: 0 };
  const guard = build({
    reflector: makeReflector({ isPublic: true }),
    jwt: {
      verifyAccess: async () => {
        jwtCalls.count += 1;
        throw new Error('should not be called');
      },
    },
  });
  const ctx = makeContext({ authorization: undefined });
  assert.equal(await guard.canActivate(ctx), true);
  assert.equal(jwtCalls.count, 0);
});

test('non-HTTP transports (worker, RPC) bypass the guard', async () => {
  const guard = build();
  const ctx = {
    getType: () => 'rpc',
    getHandler: () => () => {},
    getClass: () => class {},
    switchToHttp: () => {
      throw new Error('should not be called for non-http');
    },
  };
  assert.equal(await guard.canActivate(ctx), true);
});
