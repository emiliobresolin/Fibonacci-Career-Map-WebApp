// DB-integration test for Story 2-6 AC3 + AC4.
//
//   AC3: a cross-org read seeded with two orgs cannot return the other
//        org's rows.
//   AC4: setting `app.current_org_id` to a non-UUID returns a structured
//        error (RlsInvalidOrgIdError), not a Postgres crash.
//
// Gated by DATABASE_URL — when the env var is absent (CI / scaffold
// runs / contributor laptops without local PG), the suite skips
// cleanly rather than failing. Run locally with:
//   DATABASE_URL=postgres://...  pnpm --filter @fcm/api test
//
// The test uses a dedicated `_rls_test_` slug prefix to avoid colliding
// with seed data, and cleans up the rows it inserts.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL;
const RUN = Boolean(DATABASE_URL);

if (!RUN) {
  test('RLS DB-integration suite — skipped (DATABASE_URL not set)', { skip: true }, () => {});
} else {
  const { PrismaClient } = await import('@prisma/client');
  const { withOrgScope, RlsInvalidOrgIdError } = await import('../dist/prisma/rls.helpers.js');
  const { randomUUID } = await import('node:crypto');

  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  const SLUG_A = `_rls_test_a_${Date.now()}`;
  const SLUG_B = `_rls_test_b_${Date.now()}`;
  let orgAId;
  let orgBId;
  let userAId;
  let userBId;

  test('setup: seed two organizations + one user in each', async () => {
    const orgA = await prisma.organization.create({
      data: { slug: SLUG_A, name: 'RLS Test A' },
    });
    const orgB = await prisma.organization.create({
      data: { slug: SLUG_B, name: 'RLS Test B' },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
    userAId = randomUUID();
    userBId = randomUUID();
    await withOrgScope(prisma, orgAId, (tx) =>
      tx.user.create({
        data: { id: userAId, organizationId: orgAId, email: 'a@example.test', displayName: 'A' },
      }),
    );
    await withOrgScope(prisma, orgBId, (tx) =>
      tx.user.create({
        data: { id: userBId, organizationId: orgBId, email: 'b@example.test', displayName: 'B' },
      }),
    );
  });

  test('AC3: scoping to orgA cannot return orgB rows', async () => {
    const users = await withOrgScope(prisma, orgAId, (tx) =>
      tx.user.findMany({ where: { OR: [{ id: userAId }, { id: userBId }] } }),
    );
    assert.equal(users.length, 1);
    assert.equal(users[0].id, userAId);
  });

  test('AC3: scoping to orgB cannot return orgA rows', async () => {
    const users = await withOrgScope(prisma, orgBId, (tx) =>
      tx.user.findMany({ where: { OR: [{ id: userAId }, { id: userBId }] } }),
    );
    assert.equal(users.length, 1);
    assert.equal(users[0].id, userBId);
  });

  test('AC3: querying users without an org scope returns no rows (closed-fail)', async () => {
    // Direct prisma access, no withOrgScope wrapper — RLS policy evaluates
    // current_setting('app.current_org_id', true) as NULL → row excluded.
    const users = await prisma.user.findMany({
      where: { OR: [{ id: userAId }, { id: userBId }] },
    });
    assert.equal(users.length, 0);
  });

  test('AC4: non-UUID organizationId raises RlsInvalidOrgIdError (no Postgres crash)', async () => {
    await assert.rejects(
      () => withOrgScope(prisma, 'not-a-uuid', async () => undefined),
      RlsInvalidOrgIdError,
    );
  });

  test('teardown: delete seed rows', async () => {
    await withOrgScope(prisma, orgAId, (tx) => tx.user.delete({ where: { id: userAId } }));
    await withOrgScope(prisma, orgBId, (tx) => tx.user.delete({ where: { id: userBId } }));
    await prisma.organization.delete({ where: { id: orgAId } });
    await prisma.organization.delete({ where: { id: orgBId } });
    await prisma.$disconnect();
  });
}
