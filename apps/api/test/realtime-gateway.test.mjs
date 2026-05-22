// Story 5-1 AC3 — RealtimeGateway stamps a correlation_id on every
// socket connection. We don't boot a full Socket.IO server here
// (would need live Redis); instead the gateway's lifecycle hooks
// are invoked directly with a fake Socket object.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { RealtimeGateway } = await import('../dist/realtime/realtime.gateway.js');

function makeConfigStub() {
  return { get: () => undefined };
}

function makeSocket({ headers = {}, id = 'sid-1' } = {}) {
  return {
    id,
    handshake: { headers },
    data: {},
  };
}

test('AC3: handleConnection mints a correlation_id when X-Request-Id is absent', () => {
  const gateway = new RealtimeGateway(makeConfigStub());
  const socket = makeSocket();
  gateway.handleConnection(socket);
  // RFC 4122 v4 UUID shape
  assert.match(
    socket.data.correlation_id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test('AC3: handleConnection preserves an inbound X-Request-Id (correlation chain)', () => {
  const gateway = new RealtimeGateway(makeConfigStub());
  const inboundId = 'req-from-http-side-abc123';
  const socket = makeSocket({ headers: { 'x-request-id': inboundId } });
  gateway.handleConnection(socket);
  assert.equal(socket.data.correlation_id, inboundId);
});

test('AC3: handleConnection unwraps array header into a single string', () => {
  const gateway = new RealtimeGateway(makeConfigStub());
  const socket = makeSocket({ headers: { 'x-request-id': ['first-id', 'extra'] } });
  gateway.handleConnection(socket);
  assert.equal(socket.data.correlation_id, 'first-id');
});

test('handleDisconnect runs without throwing even when correlation_id was never stamped', () => {
  const gateway = new RealtimeGateway(makeConfigStub());
  const socket = makeSocket();
  // Skip handleConnection. handleDisconnect on a socket without
  // correlation_id should be defensive — never crash.
  assert.doesNotThrow(() => gateway.handleDisconnect(socket));
});
