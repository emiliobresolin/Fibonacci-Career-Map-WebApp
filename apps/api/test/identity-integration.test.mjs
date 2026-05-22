// Story 6-2a AC5: live-DB assertions for the identity tables.
//
// AC5 names three behaviors that ONLY a real Postgres can prove:
//   1. RLS isolation — org-A scope cannot see org-B's employees.
//   2. Self-management rejection — INSERT with manager = employee
//      fails with the check_violation SQLSTATE the trigger raises.
//   3. Uniqueness violation — a second active assignment with the
//      same (employee, org, role) fails the PARTIAL unique index.
//
// Gated by DATABASE_URL like the existing rls-integration.test.mjs.
// Without a live DB the entire suite skips cleanly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL;
const RUN = Boolean(DATABASE_URL);

if (!RUN) {
  test('Identity DB-integration suite — skipped (DATABASE_URL not set)', { skip: true }, () => {});
} else {
  const { PrismaClient, Prisma } = await import('@prisma/client');
  const { withOrgScope } = await import('../dist/prisma/rls.helpers.js');
  const { randomUUID } = await import('node:crypto');

  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  const SLUG_A = `_identity_test_a_${Date.now()}`;
  const SLUG_B = `_identity_test_b_${Date.now()}`;
  let orgAId;
  let orgBId;
  let userAId;
  let userBId;
  let empAId;
  let empBId;

  test('setup: two orgs + one user + one employee each', async () => {
    const orgA = await prisma.organization.create({ data: { slug: SLUG_A, name: 'Identity A' } });
    const orgB = await prisma.organization.create({ data: { slug: SLUG_B, name: 'Identity B' } });
    orgAId = orgA.id;
    orgBId = orgB.id;
    userAId = randomUUID();
    userBId = randomUUID();
    await withOrgScope(prisma, orgAId, (tx) =>
      tx.user.create({
        data: { id: userAId, organizationId: orgAId, email: 'a@id.test', displayName: 'A' },
      }),
    );
    await withOrgScope(prisma, orgBId, (tx) =>
      tx.user.create({
        data: { id: userBId, organizationId: orgBId, email: 'b@id.test', displayName: 'B' },
      }),
    );
    const empA = await withOrgScope(prisma, orgAId, (tx) =>
      tx.employee.create({ data: { organizationId: orgAId, userId: userAId } }),
    );
    const empB = await withOrgScope(prisma, orgBId, (tx) =>
      tx.employee.create({ data: { organizationId: orgBId, userId: userBId } }),
    );
    empAId = empA.id;
    empBId = empB.id;
  });

  // ── AC5.1 — RLS isolation ─────────────────────────────────────────

  test('AC5.1: scoping to orgA cannot return orgB employees', async () => {
    const rows = await withOrgScope(prisma, orgAId, (tx) =>
      tx.employee.findMany({ where: { OR: [{ id: empAId }, { id: empBId }] } }),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, empAId);
  });

  test('AC5.1: querying employees without an org scope returns no rows (closed-fail)', async () => {
    const rows = await prisma.employee.findMany({
      where: { OR: [{ id: empAId }, { id: empBId }] },
    });
    assert.equal(rows.length, 0);
  });

  // ── AC5.2 — self-management rejection ─────────────────────────────

  test('AC5.2: INSERT with manager_employee_id = employee_id raises check_violation', async () => {
    // The trigger raises SQLSTATE 23514 (check_violation). Prisma
    // wraps SQL errors from raw paths as PrismaClientKnownRequestError
    // P2010 or PrismaClientUnknownRequestError depending on the route.
    // For the ORM path (employee_assignment.create), Prisma surfaces
    // the underlying Postgres error message verbatim — we assert on
    // the message containing the trigger's prose to catch a future
    // regression that silently re-routes the validation client-side.
    let threw = false;
    try {
      await withOrgScope(prisma, orgAId, (tx) =>
        tx.employeeAssignment.create({
          data: {
            organizationId: orgAId,
            employeeId: empAId,
            role: 'EMPLOYEE',
            managerEmployeeId: empAId,
          },
        }),
      );
    } catch (err) {
      threw = true;
      assert.match(
        String(err.message ?? ''),
        /cannot manage themselves/i,
        'self-management error message must reference the invariant',
      );
    }
    assert.ok(threw, 'self-management INSERT must be rejected by the DB');
  });

  test('AC5.2: UPDATE setting manager_employee_id = employee_id is also rejected', async () => {
    // Insert a normal assignment first, then attempt the update.
    const assignment = await withOrgScope(prisma, orgAId, (tx) =>
      tx.employeeAssignment.create({
        data: {
          organizationId: orgAId,
          employeeId: empAId,
          role: 'MANAGER',
          managerEmployeeId: null,
        },
      }),
    );
    let threw = false;
    try {
      await withOrgScope(prisma, orgAId, (tx) =>
        tx.employeeAssignment.update({
          where: { id: assignment.id },
          data: { managerEmployeeId: empAId },
        }),
      );
    } catch (err) {
      threw = true;
      assert.match(String(err.message ?? ''), /cannot manage themselves/i);
    }
    assert.ok(threw, 'self-management UPDATE must be rejected by the DB');
    // Deactivate the row we created so the next test's unique-violation
    // INSERT for (empAId, orgAId, 'MANAGER') isn't blocked by an
    // already-active row.
    await withOrgScope(prisma, orgAId, (tx) =>
      tx.employeeAssignment.update({
        where: { id: assignment.id },
        data: { deactivatedAt: new Date() },
      }),
    );
  });

  // ── AC5.3 — partial-unique violation ──────────────────────────────

  test('AC5.3: two ACTIVE assignments with same (employee, org, role) are rejected', async () => {
    // First active grant — succeeds.
    const firstAssign = await withOrgScope(prisma, orgAId, (tx) =>
      tx.employeeAssignment.create({
        data: {
          organizationId: orgAId,
          employeeId: empAId,
          role: 'EMPLOYEE',
          managerEmployeeId: null,
        },
      }),
    );
    // Second active grant for the same key — must be rejected by the
    // partial unique index.
    let threw = false;
    try {
      await withOrgScope(prisma, orgAId, (tx) =>
        tx.employeeAssignment.create({
          data: {
            organizationId: orgAId,
            employeeId: empAId,
            role: 'EMPLOYEE',
            managerEmployeeId: null,
          },
        }),
      );
    } catch (err) {
      threw = true;
      assert.ok(
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002',
        `expected P2002, got ${err.code ?? err.constructor.name}: ${err.message}`,
      );
    }
    assert.ok(threw, 'duplicate active assignment must be rejected');
    // Deactivate the first and confirm a re-grant is now permitted.
    await withOrgScope(prisma, orgAId, (tx) =>
      tx.employeeAssignment.update({
        where: { id: firstAssign.id },
        data: { deactivatedAt: new Date() },
      }),
    );
    const reGrant = await withOrgScope(prisma, orgAId, (tx) =>
      tx.employeeAssignment.create({
        data: {
          organizationId: orgAId,
          employeeId: empAId,
          role: 'EMPLOYEE',
          managerEmployeeId: null,
        },
      }),
    );
    assert.ok(reGrant.id, 're-grant after deactivation should succeed');
  });

  // ── teardown ──────────────────────────────────────────────────────

  test('teardown: delete seed rows', async () => {
    // Order matters: assignments → employees → users → orgs. Each
    // tenant-scoped delete MUST go through withOrgScope — an unscoped
    // deleteMany against an RLS-protected table silently returns
    // count=0 (FORCE RLS + missing GUC → predicate evaluates to NULL).
    // The FK CASCADE from employees → employee_assignments would
    // rescue the cleanup, but we'd rather not rely on that and have
    // the explicit deletes actually do their job.
    await withOrgScope(prisma, orgAId, (tx) =>
      tx.employeeAssignment.deleteMany({ where: { organizationId: orgAId } }),
    );
    await withOrgScope(prisma, orgBId, (tx) =>
      tx.employeeAssignment.deleteMany({ where: { organizationId: orgBId } }),
    );
    await withOrgScope(prisma, orgAId, (tx) => tx.employee.delete({ where: { id: empAId } }));
    await withOrgScope(prisma, orgBId, (tx) => tx.employee.delete({ where: { id: empBId } }));
    await withOrgScope(prisma, orgAId, (tx) => tx.user.delete({ where: { id: userAId } }));
    await withOrgScope(prisma, orgBId, (tx) => tx.user.delete({ where: { id: userBId } }));
    await prisma.organization.delete({ where: { id: orgAId } });
    await prisma.organization.delete({ where: { id: orgBId } });
    await prisma.$disconnect();
  });
}
