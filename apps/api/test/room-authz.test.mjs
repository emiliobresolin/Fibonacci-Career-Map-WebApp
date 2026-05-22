// Story 5-3 — room-join authorization contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { authorizeRoomJoin, parseRoom } = await import('../dist/realtime/room-authz.js');

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ORG_X = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ORG_Y = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const EMP_1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const employeeActor = {
  user_id: USER_A,
  organization_id: ORG_X,
  role: 'EMPLOYEE',
  display_name: 'A',
};
const managerActor = { ...employeeActor, role: 'MANAGER' };
const adminActor = { ...employeeActor, role: 'ADMIN' };

// ── parseRoom ───────────────────────────────────────────────────────

test('parseRoom rejects malformed input (no colon, empty id, non-uuid)', () => {
  assert.equal(parseRoom('user'), null);
  assert.equal(parseRoom('user:'), null);
  assert.equal(parseRoom('user:not-a-uuid'), null);
  assert.equal(parseRoom('unknown:' + USER_A), null);
  assert.equal(parseRoom(''), null);
});

test('parseRoom accepts the four documented kinds with valid uuids', () => {
  assert.deepEqual(parseRoom(`user:${USER_A}`), { kind: 'user', id: USER_A });
  assert.deepEqual(parseRoom(`org:${ORG_X}`), { kind: 'org', id: ORG_X });
  assert.deepEqual(parseRoom(`employee:${EMP_1}`), { kind: 'employee', id: EMP_1 });
  assert.deepEqual(parseRoom(`manager-team:${USER_A}`), { kind: 'manager-team', id: USER_A });
});

// ── AC1 — user:{id} ────────────────────────────────────────────────

test('AC1: user:{id} allowed when id matches actor.user_id', async () => {
  const v = await authorizeRoomJoin(employeeActor, `user:${USER_A}`);
  assert.deepEqual(v, { allowed: true });
});

test('AC1: user:{id} rejected when id does not match (not_self)', async () => {
  const v = await authorizeRoomJoin(employeeActor, `user:${USER_B}`);
  assert.deepEqual(v, { allowed: false, reason: 'not_self' });
});

// ── AC2 — org:{id} ────────────────────────────────────────────────

test('AC2: org:{id} allowed when actor is ADMIN AND org matches', async () => {
  const v = await authorizeRoomJoin(adminActor, `org:${ORG_X}`);
  assert.deepEqual(v, { allowed: true });
});

test('AC2: org:{id} rejected for non-ADMIN even when org matches', async () => {
  const v = await authorizeRoomJoin(managerActor, `org:${ORG_X}`);
  assert.deepEqual(v, { allowed: false, reason: 'not_admin' });
});

test('AC2: org:{id} rejected for ADMIN of DIFFERENT org (cross_org)', async () => {
  const v = await authorizeRoomJoin(adminActor, `org:${ORG_Y}`);
  assert.deepEqual(v, { allowed: false, reason: 'cross_org' });
});

// ── AC3 — employee:{id} ───────────────────────────────────────────

test('AC3: employee:{id} allowed when actor is ADMIN regardless of probe', async () => {
  const v = await authorizeRoomJoin(adminActor, `employee:${EMP_1}`);
  assert.deepEqual(v, { allowed: true });
});

test('AC3: employee:{id} allowed when subject userId matches actor (self)', async () => {
  const probe = {
    employeeUserId: async () => USER_A,
    isDirectManagerOf: async () => false,
  };
  const v = await authorizeRoomJoin(employeeActor, `employee:${EMP_1}`, probe);
  assert.deepEqual(v, { allowed: true });
});

test('AC3: employee:{id} allowed when actor is direct manager', async () => {
  const probe = {
    employeeUserId: async () => USER_B, // not actor
    isDirectManagerOf: async () => true,
  };
  const v = await authorizeRoomJoin(managerActor, `employee:${EMP_1}`, probe);
  assert.deepEqual(v, { allowed: true });
});

test('AC3: employee:{id} rejected when neither self nor manager nor ADMIN', async () => {
  const probe = {
    employeeUserId: async () => USER_B,
    isDirectManagerOf: async () => false,
  };
  const v = await authorizeRoomJoin(employeeActor, `employee:${EMP_1}`, probe);
  assert.deepEqual(v, { allowed: false, reason: 'not_visible' });
});

test('AC3: employee:{id} closed-fail when no probe is supplied (non-ADMIN)', async () => {
  const v = await authorizeRoomJoin(employeeActor, `employee:${EMP_1}`);
  assert.deepEqual(v, { allowed: false, reason: 'not_visible' });
});

// ── AC4 — manager-team:{userId} ───────────────────────────────────

test('AC4: manager-team:{userId} allowed when actor is that manager', async () => {
  const v = await authorizeRoomJoin(managerActor, `manager-team:${USER_A}`);
  assert.deepEqual(v, { allowed: true });
});

test('AC4: manager-team:{userId} allowed for ADMIN regardless of id', async () => {
  const v = await authorizeRoomJoin(adminActor, `manager-team:${USER_B}`);
  assert.deepEqual(v, { allowed: true });
});

test('AC4: manager-team:{userId} rejected when actor is neither that manager nor ADMIN', async () => {
  const v = await authorizeRoomJoin(managerActor, `manager-team:${USER_B}`);
  assert.deepEqual(v, { allowed: false, reason: 'not_self' });
});

// ── Malformed room ────────────────────────────────────────────────

test('malformed room kind rejected uniformly', async () => {
  const v = await authorizeRoomJoin(adminActor, 'unknown:' + USER_A);
  assert.deepEqual(v, { allowed: false, reason: 'malformed_room' });
});
