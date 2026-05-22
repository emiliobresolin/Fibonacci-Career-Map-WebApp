// Story 5-1 + 5-2 — RealtimeGateway lifecycle hooks. Tests are unit-
// level against the gateway class with hand-stubbed JwtService +
// SessionStoreService — same shape as auth-guard.test.mjs (Story 2-4).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { RealtimeGateway } = await import('../dist/realtime/realtime.gateway.js');

const SUB = '11111111-1111-1111-1111-111111111111';
const ORG = '22222222-2222-2222-2222-222222222222';
const JTI = '33333333-3333-3333-3333-333333333333';

function makeConfigStub() {
  return { get: () => undefined };
}

function makeJwtStub({ verify = async () => ({ sub: SUB, org: ORG, role: 'EMPLOYEE', name: 'U', jti: JTI }) } = {}) {
  return { verifyAccess: verify };
}

function makeSessionStub({ active = true } = {}) {
  return { isActive: async () => active };
}

function makeSocket({ headers = {}, auth = {}, id = 'sid-1' } = {}) {
  const calls = { disconnected: false };
  return {
    id,
    handshake: { headers, auth },
    data: {},
    disconnect: (close) => {
      calls.disconnected = true;
      calls.closeArg = close;
    },
    _calls: calls,
  };
}

function build({ jwt, sessions } = {}) {
  return new RealtimeGateway(
    makeConfigStub(),
    jwt ?? makeJwtStub(),
    sessions ?? makeSessionStub(),
  );
}

// ── Story 5-1 AC3 — correlation_id stamping ─────────────────────────

test('AC3: handleConnection mints a correlation_id when X-Request-Id is absent', async () => {
  const gateway = build();
  const socket = makeSocket({ auth: { token: 'tok' } });
  await gateway.handleConnection(socket);
  assert.match(
    socket.data.correlation_id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test('AC3: handleConnection preserves an inbound X-Request-Id (correlation chain)', async () => {
  const gateway = build();
  const socket = makeSocket({ headers: { 'x-request-id': 'req-abc' }, auth: { token: 'tok' } });
  await gateway.handleConnection(socket);
  assert.equal(socket.data.correlation_id, 'req-abc');
});

// ── Story 5-2 AC1 — handshake rejection paths ───────────────────────

test('AC1: rejects connection with no token (missing both auth.token AND Authorization header)', async () => {
  const gateway = build();
  const socket = makeSocket();
  await gateway.handleConnection(socket);
  assert.equal(socket._calls.disconnected, true);
  assert.equal(socket.data.actor, undefined);
});

test('AC1: rejects connection when JwtService.verifyAccess throws (expired / malformed)', async () => {
  const gateway = build({
    jwt: makeJwtStub({
      verify: async () => {
        throw new Error('jwt expired');
      },
    }),
  });
  const socket = makeSocket({ auth: { token: 'expired.jwt.string' } });
  await gateway.handleConnection(socket);
  assert.equal(socket._calls.disconnected, true);
  assert.equal(socket.data.actor, undefined);
});

test('AC1: rejects connection when session jti is no longer active (forced logout)', async () => {
  const gateway = build({ sessions: makeSessionStub({ active: false }) });
  const socket = makeSocket({ auth: { token: 'tok' } });
  await gateway.handleConnection(socket);
  assert.equal(socket._calls.disconnected, true);
  assert.equal(socket.data.actor, undefined);
});

// ── Story 5-2 AC2 — successful handshake populates ActorContext ─────

test('AC2: successful handshake attaches ActorContext to socket.data', async () => {
  const gateway = build();
  const socket = makeSocket({ auth: { token: 'tok' } });
  await gateway.handleConnection(socket);
  assert.equal(socket._calls.disconnected, false);
  assert.deepEqual(socket.data.actor, {
    user_id: SUB,
    organization_id: ORG,
    role: 'EMPLOYEE',
    display_name: 'U',
  });
});

test('AC1: token may also be supplied via Authorization: Bearer header (case-insensitive)', async () => {
  const gateway = build();
  const socket = makeSocket({ headers: { authorization: 'bearer some.jwt.token' } });
  await gateway.handleConnection(socket);
  assert.equal(socket._calls.disconnected, false);
  assert.ok(socket.data.actor);
});

test('AC1: empty token string in auth.token is treated as missing', async () => {
  const gateway = build();
  const socket = makeSocket({ auth: { token: '' } });
  await gateway.handleConnection(socket);
  assert.equal(socket._calls.disconnected, true);
});

// ── disconnect defensiveness ────────────────────────────────────────

test('handleDisconnect runs without throwing even when no actor was ever attached', () => {
  const gateway = build();
  const socket = makeSocket();
  assert.doesNotThrow(() => gateway.handleDisconnect(socket));
});
