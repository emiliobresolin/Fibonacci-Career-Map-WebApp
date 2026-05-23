// Story 8-3 AC2 — authorizeEvidenceView: owner, direct manager, ADMIN
// authorized; everyone else denied. Pure predicate; no IO.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { authorizeEvidenceView } = await import('../dist/evidence/evidence-authz.js');

const ALICE_USER = '11111111-1111-4111-8111-111111111111';
const BOB_USER = '22222222-2222-4222-8222-222222222222';
const MANAGER_USER = '33333333-3333-4333-8333-333333333333';
const ADMIN_USER = '44444444-4444-4444-8444-444444444444';

const ALICE_EMP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MANAGER_EMP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STRANGER_EMP = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function input({
  actorUser = ALICE_USER,
  actorRole = 'EMPLOYEE',
  ownerUserId = ALICE_USER,
  actorEmployee = { id: ALICE_EMP },
  assignments = [],
} = {}) {
  return {
    actor: { user_id: actorUser, role: actorRole },
    ownerEmployee: { userId: ownerUserId },
    actorEmployee,
    subjectAssignments: assignments,
  };
}

test('AC2: owner is allowed (via=OWNER)', () => {
  const result = authorizeEvidenceView(input());
  assert.equal(result.allowed, true);
  assert.equal(result.via, 'OWNER');
});

test('AC2: ADMIN of the org is allowed regardless of employee shape (via=ADMIN)', () => {
  const result = authorizeEvidenceView(
    input({
      actorUser: ADMIN_USER,
      actorRole: 'ADMIN',
      ownerUserId: BOB_USER,
      actorEmployee: null, // ADMIN may not have an employee row
      assignments: [],
    }),
  );
  assert.equal(result.allowed, true);
  assert.equal(result.via, 'ADMIN');
});

test('AC2: direct manager of the subject is allowed (via=MANAGER)', () => {
  const result = authorizeEvidenceView(
    input({
      actorUser: MANAGER_USER,
      actorRole: 'MANAGER',
      ownerUserId: BOB_USER,
      actorEmployee: { id: MANAGER_EMP },
      assignments: [{ managerEmployeeId: MANAGER_EMP, deactivatedAt: null }],
    }),
  );
  assert.equal(result.allowed, true);
  assert.equal(result.via, 'MANAGER');
});

test('AC2: unrelated EMPLOYEE is denied', () => {
  const result = authorizeEvidenceView(
    input({
      actorUser: BOB_USER,
      actorRole: 'EMPLOYEE',
      ownerUserId: ALICE_USER,
      actorEmployee: { id: STRANGER_EMP },
      assignments: [{ managerEmployeeId: MANAGER_EMP, deactivatedAt: null }],
    }),
  );
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? '', /authorized/i);
});

test('AC2: MANAGER who is NOT the direct manager is denied', () => {
  // Same role, different team.
  const result = authorizeEvidenceView(
    input({
      actorUser: MANAGER_USER,
      actorRole: 'MANAGER',
      ownerUserId: BOB_USER,
      actorEmployee: { id: STRANGER_EMP },
      assignments: [{ managerEmployeeId: MANAGER_EMP, deactivatedAt: null }],
    }),
  );
  assert.equal(result.allowed, false);
});

test('AC2: deactivated manager assignment does NOT grant access', () => {
  // A former manager whose assignment was soft-deactivated must lose
  // their viewing privilege immediately. Without the deactivated_at
  // check, deactivation would only revoke write paths, not read.
  const result = authorizeEvidenceView(
    input({
      actorUser: MANAGER_USER,
      actorRole: 'MANAGER',
      ownerUserId: BOB_USER,
      actorEmployee: { id: MANAGER_EMP },
      assignments: [{ managerEmployeeId: MANAGER_EMP, deactivatedAt: new Date() }],
    }),
  );
  assert.equal(result.allowed, false);
});

test('AC2: actor with no employee row is denied unless ADMIN', () => {
  // A user authenticated against this org but without an Employee
  // record cannot view evidence unless ADMIN. The owner check
  // requires the User → Employee linkage on the SUBJECT side, not
  // the actor.
  const result = authorizeEvidenceView(
    input({
      actorUser: BOB_USER,
      actorRole: 'EMPLOYEE',
      ownerUserId: ALICE_USER,
      actorEmployee: null,
      assignments: [],
    }),
  );
  assert.equal(result.allowed, false);
});

test('AC2: subject with 2 active assignments — only the LISTED manager can view', () => {
  // A subject may be matrixed under two managers (e.g. team lead +
  // dotted-line PM). Each manager who is listed on at least one
  // active assignment can view; an unrelated manager (not listed
  // anywhere) cannot. Walks the .some() semantics over the array.
  const MGR_A_EMP = 'a1a1a1a1-1111-4111-8111-aaaaaaaaaaaa';
  const MGR_B_EMP = 'b1b1b1b1-2222-4222-8222-bbbbbbbbbbbb';
  const MGR_C_EMP = 'c1c1c1c1-3333-4333-8333-cccccccccccc';
  const assignments = [
    { managerEmployeeId: MGR_A_EMP, deactivatedAt: null },
    { managerEmployeeId: MGR_B_EMP, deactivatedAt: null },
  ];
  // Manager A is listed → allowed.
  assert.equal(
    authorizeEvidenceView(
      input({
        actorUser: MANAGER_USER,
        actorRole: 'MANAGER',
        ownerUserId: BOB_USER,
        actorEmployee: { id: MGR_A_EMP },
        assignments,
      }),
    ).allowed,
    true,
  );
  // Manager B also listed → allowed.
  assert.equal(
    authorizeEvidenceView(
      input({
        actorUser: MANAGER_USER,
        actorRole: 'MANAGER',
        ownerUserId: BOB_USER,
        actorEmployee: { id: MGR_B_EMP },
        assignments,
      }),
    ).allowed,
    true,
  );
  // Manager C not listed → denied even though they hold MANAGER role.
  assert.equal(
    authorizeEvidenceView(
      input({
        actorUser: MANAGER_USER,
        actorRole: 'MANAGER',
        ownerUserId: BOB_USER,
        actorEmployee: { id: MGR_C_EMP },
        assignments,
      }),
    ).allowed,
    false,
  );
});

test('AC2: transitive manager (skip-level) is NOT allowed', () => {
  // "Direct manager" — not transitive. If manager A reports to
  // manager B, and employee X reports to manager A, then B is NOT
  // a direct manager of X. The query only walks one hop.
  const DIRECT_MGR_EMP = 'a1a1a1a1-1111-4111-8111-aaaaaaaaaaaa';
  const SKIP_MGR_EMP = 'b1b1b1b1-2222-4222-8222-bbbbbbbbbbbb';
  const result = authorizeEvidenceView(
    input({
      actorUser: MANAGER_USER,
      actorRole: 'MANAGER',
      ownerUserId: BOB_USER,
      actorEmployee: { id: SKIP_MGR_EMP },
      // Subject reports to direct manager; the skip-level manager
      // is implied by org structure but never appears in the
      // SUBJECT'S assignment row.
      assignments: [{ managerEmployeeId: DIRECT_MGR_EMP, deactivatedAt: null }],
    }),
  );
  assert.equal(result.allowed, false);
});

test('AC2: owner check wins over MANAGER edge — self-view does not require an active assignment', () => {
  // Owners (including managers who are also employees somewhere) can
  // always see their own evidence even if their employee assignments
  // have changed.
  const result = authorizeEvidenceView(
    input({
      actorUser: ALICE_USER,
      actorRole: 'EMPLOYEE',
      ownerUserId: ALICE_USER,
      actorEmployee: null,
      assignments: [],
    }),
  );
  assert.equal(result.allowed, true);
  assert.equal(result.via, 'OWNER');
});
