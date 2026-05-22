// Layer-2 ActorContext + SelfApprovalGuard contract tests (Story 2-5).
//
// AC1 — ActorContext shape via the request-side adapter
// AC2 — `SelfApprovalGuard.ensureNotSelf` raises `SelfApprovalNotAllowedError`
//        when actor.user_id === subjectUserId
// AC3 — example service method consumes ActorContext + calls the guard;
//        failing + passing unit tests cover both outcomes

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { SelfApprovalGuard, SelfApprovalNotAllowedError } = await import(
  '../dist/auth/self-approval.guard.js'
);
const { actorContextFromRequestUser, actorFromJobData, actorFromSocket, withActor } = await import(
  '../dist/auth/actor-context.js'
);

// ── Fixtures ─────────────────────────────────────────────────────────

const MANAGER_ACTOR = {
  user_id: '11111111-1111-1111-1111-111111111111',
  organization_id: '22222222-2222-2222-2222-222222222222',
  role: 'MANAGER',
  display_name: 'Manager Bob',
};

const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';

// AC3 fixture: a stand-in service method that takes ActorContext and runs
// the guard before touching any state. Future Epic 8 (evidence approval)
// and Epic 13 (promotion decision) services follow this exact shape.
class ExampleApprovalService {
  constructor() {
    this.decided = []; // captures successful "approve" calls
  }
  approveResource(actor, subjectUserId, reason) {
    SelfApprovalGuard.ensureNotSelf(actor, subjectUserId);
    this.decided.push({ actor: actor.user_id, subject: subjectUserId, reason });
    return { ok: true };
  }
}

// ── AC1 — ActorContext shape ─────────────────────────────────────────

test('AC1: actorContextFromRequestUser preserves the four documented fields', () => {
  const reqUser = {
    user_id: 'u1',
    organization_id: 'o1',
    role: 'MANAGER',
    display_name: 'Bob',
    jti: 'j1', // extra fields must NOT leak into ActorContext
  };
  assert.deepEqual(actorContextFromRequestUser(reqUser), {
    user_id: 'u1',
    organization_id: 'o1',
    role: 'MANAGER',
    display_name: 'Bob',
  });
});

// ── AC1 — BullMQ propagation ─────────────────────────────────────────

test('actorFromJobData extracts a well-formed actor from job payload', () => {
  const data = {
    actor: MANAGER_ACTOR,
    employeeId: 'e1',
  };
  assert.deepEqual(actorFromJobData(data), MANAGER_ACTOR);
});

test('actorFromJobData throws when job data is not an object', () => {
  assert.throws(() => actorFromJobData(null), /missing actor context/);
  assert.throws(() => actorFromJobData(undefined), /missing actor context/);
  assert.throws(() => actorFromJobData('payload'), /missing actor context/);
});

test('actorFromJobData throws when `actor` field is missing', () => {
  assert.throws(() => actorFromJobData({ employeeId: 'e1' }), /missing actor context/);
});

test('actorFromJobData throws when actor fields are malformed', () => {
  assert.throws(
    () => actorFromJobData({ actor: { user_id: 'u1' /* missing rest */ } }),
    /malformed fields/,
  );
});

test('actorFromJobData rejects roles outside the ROLES enum (forged-payload guard)', () => {
  const data = {
    actor: { ...MANAGER_ACTOR, role: 'SUPERUSER' },
  };
  assert.throws(() => actorFromJobData(data), /unknown role: SUPERUSER/);
});

test('withActor() embeds the actor into job data so the consumer round-trips it', () => {
  const job = withActor(MANAGER_ACTOR, { employeeId: 'e1' });
  assert.deepEqual(job, { employeeId: 'e1', actor: MANAGER_ACTOR });
  assert.deepEqual(actorFromJobData(job), MANAGER_ACTOR);
});

test('actorFromSocket reads socket.data.actor through the same shape-validator', () => {
  const socket = { data: { actor: MANAGER_ACTOR } };
  assert.deepEqual(actorFromSocket(socket), MANAGER_ACTOR);
});

test('actorFromSocket throws on a socket without data.actor', () => {
  assert.throws(() => actorFromSocket({}), /no socket\.data/);
  assert.throws(() => actorFromSocket({ data: {} }), /no `actor` field/);
});

// ── AC2 — SelfApprovalGuard contract ─────────────────────────────────

test('AC2: ensureNotSelf raises when actor === subject (same user_id)', () => {
  assert.throws(
    () => SelfApprovalGuard.ensureNotSelf(MANAGER_ACTOR, MANAGER_ACTOR.user_id),
    SelfApprovalNotAllowedError,
  );
});

test('AC2: SelfApprovalNotAllowedError carries actorUserId + subjectUserId for audit', () => {
  try {
    SelfApprovalGuard.ensureNotSelf(MANAGER_ACTOR, MANAGER_ACTOR.user_id);
    assert.fail('expected SelfApprovalNotAllowedError');
  } catch (err) {
    assert.ok(err instanceof SelfApprovalNotAllowedError);
    assert.equal(err.code, 'SELF_APPROVAL_NOT_ALLOWED');
    assert.equal(err.actorUserId, MANAGER_ACTOR.user_id);
    assert.equal(err.subjectUserId, MANAGER_ACTOR.user_id);
  }
});

test('AC2: ensureNotSelf passes when actor !== subject', () => {
  assert.doesNotThrow(() => SelfApprovalGuard.ensureNotSelf(MANAGER_ACTOR, OTHER_USER_ID));
});

test('AC2: subjectUserId must be a non-empty string (programming-bug guard)', () => {
  assert.throws(() => SelfApprovalGuard.ensureNotSelf(MANAGER_ACTOR, ''), TypeError);
  assert.throws(() => SelfApprovalGuard.ensureNotSelf(MANAGER_ACTOR, null), TypeError);
  assert.throws(() => SelfApprovalGuard.ensureNotSelf(MANAGER_ACTOR, undefined), TypeError);
});

test('AC2: actor.user_id must be a non-empty string (malformed-actor guard)', () => {
  // Without this defence, `undefined === '<sub>'` is always false and the
  // self-check would silently pass — a critical correctness hazard.
  assert.throws(() => SelfApprovalGuard.ensureNotSelf({}, OTHER_USER_ID), TypeError);
  assert.throws(
    () => SelfApprovalGuard.ensureNotSelf({ ...MANAGER_ACTOR, user_id: '' }, OTHER_USER_ID),
    TypeError,
  );
  assert.throws(() => SelfApprovalGuard.ensureNotSelf(null, OTHER_USER_ID), TypeError);
});

// ── AC3 — example service exercises both outcomes ────────────────────

test('AC3 failing path: service rejects self-approval via the guard', () => {
  const svc = new ExampleApprovalService();
  assert.throws(
    () => svc.approveResource(MANAGER_ACTOR, MANAGER_ACTOR.user_id, 'looks good'),
    SelfApprovalNotAllowedError,
  );
  // Side-effect must not have occurred — the guard runs before state mutation.
  assert.equal(svc.decided.length, 0);
});

test('AC3 passing path: service approves another user successfully', () => {
  const svc = new ExampleApprovalService();
  const result = svc.approveResource(MANAGER_ACTOR, OTHER_USER_ID, 'rubric met');
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(svc.decided, [
    { actor: MANAGER_ACTOR.user_id, subject: OTHER_USER_ID, reason: 'rubric met' },
  ]);
});
