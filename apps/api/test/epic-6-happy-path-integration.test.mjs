// Story 6-6: Epic-6 happy-path integration test.
//
// Walks the full bootstrap pipeline against a real Postgres:
//   1. Provision an org (Story 6-1)            — OrganizationsService.provision
//   2. Seed CDF defaults (Story 6-3)           — SeedingService.seedOrganization
//   3. Import 5 employees via CSV (Story 6-5)  — EmployeeImportService.commit
//   4. Read employees back, JOIN tracks/levels — stub for GET /v1/map/employees
//      (E10 lands the real endpoint; until then a direct repo read covers
//       the same assertions per the story's "stub permitted" carve-out)
//   5. Cross-tenant leakage check              — repeat in org B with NO
//      employees; assert org B sees zero rows
//
// Gated by DATABASE_URL like the existing rls-integration / identity-
// integration suites — without a live DB the entire suite skips
// cleanly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL;
const RUN = Boolean(DATABASE_URL);

if (!RUN) {
  test('Epic-6 happy-path integration — skipped (DATABASE_URL not set)', { skip: true }, () => {});
} else {
  const { PrismaClient } = await import('@prisma/client');
  const { withOrgScope } = await import('../dist/prisma/rls.helpers.js');
  const { OrganizationsService } = await import(
    '../dist/organizations/organizations.service.js'
  );
  const { SeedingService } = await import('../dist/seeding/seeding.service.js');
  const { EmployeeImportService } = await import(
    '../dist/identity/employee-import.service.js'
  );
  const { randomUUID } = await import('node:crypto');

  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const orgsSvc = new OrganizationsService(prisma);
  const seedSvc = new SeedingService(prisma);
  const importSvc = new EmployeeImportService(prisma);

  // Unique slugs prevent collision with parallel CI shards / repeat runs.
  // randomUUID-derived suffix instead of Date.now() because parallel
  // shards starting within the same second produce identical Date.now()
  // values and the slug @@unique would then collide. Slug format is
  // `e6-a-<8hex>` / `e6-b-<8hex>` — lowercase + hyphens only to satisfy
  // OrganizationsService.provision's SLUG_RE (which rejects underscores).
  const SUFFIX = randomUUID().slice(0, 8);
  const SLUG_A = `e6-a-${SUFFIX}`;
  const SLUG_B = `e6-b-${SUFFIX}`;
  let orgA;
  let orgB;
  /** Captured during AC1's import; reused for cross-tenant verification. */
  let importedEmails;
  let trackSEId;
  let levelSEL2Id;
  let levelSEL3Id;

  test('AC1: provision org A + seed CDF + import 5 employees via CSV', async () => {
    // (1) Provision: emits organization.created via outbox; defaults are
    //     PRD §14.2 (OWN_ONLY / SINGLE / CALIBRATION).
    orgA = await orgsSvc.provision({ slug: SLUG_A, name: 'Epic-6 Org A' });
    assert.equal(orgA.slug, SLUG_A);
    assert.equal(orgA.visibilityDefault, 'OWN_ONLY');
    assert.equal(orgA.approvalWorkflowDefault, 'SINGLE');
    assert.equal(orgA.promotionMode, 'CALIBRATION');

    // (2) Seed: writes 3 tracks × levels × layers × requirements × rules.
    //     The CDF helpers in cdf-defaults.ts pin the exact counts.
    const seedResult = await seedSvc.seedOrganization(orgA.id);
    assert.equal(seedResult.counts.tracks, 3);
    assert.equal(seedResult.counts.levels, 10);

    // Look up the SE track + L2/L3 levels — the CSV references these.
    const seTrack = await withOrgScope(prisma, orgA.id, (tx) =>
      tx.careerTrack.findUnique({
        where: { organizationId_slug: { organizationId: orgA.id, slug: 'software-engineering' } },
      }),
    );
    assert.ok(seTrack, 'CDF must seed a software-engineering track');
    trackSEId = seTrack.id;
    const seLevels = await withOrgScope(prisma, orgA.id, (tx) =>
      tx.level.findMany({ where: { careerTrackId: trackSEId } }),
    );
    const byCode = Object.fromEntries(seLevels.map((l) => [l.levelCode, l.id]));
    assert.ok(byCode['L2'], 'CDF must seed level L2 for SE');
    assert.ok(byCode['L3'], 'CDF must seed level L3 for SE');
    levelSEL2Id = byCode['L2'];
    levelSEL3Id = byCode['L3'];

    // The CSV import needs an ADMIN actor. The bootstrap-admin user is
    // not yet provisioned in this test (we skipped the bootstrap step
    // to keep the scope narrow); create a synthetic actor inline.
    const adminUserId = randomUUID();
    await withOrgScope(prisma, orgA.id, (tx) =>
      tx.user.create({
        data: {
          id: adminUserId,
          organizationId: orgA.id,
          email: `admin-${SUFFIX}@e6.test`,
          displayName: 'Test Admin',
        },
      }),
    );
    await withOrgScope(prisma, orgA.id, (tx) =>
      tx.roleAssignment.create({
        data: { userId: adminUserId, organizationId: orgA.id, role: 'ADMIN' },
      }),
    );
    const actor = {
      user_id: adminUserId,
      organization_id: orgA.id,
      role: 'ADMIN',
      display_name: 'Test Admin',
    };

    // (3) Build a 5-row CSV. Two rows reference SE L2 with the second
    //     reporting to the first (in-batch manager resolution); three
    //     reference SE L3 with no managers (independent ICs).
    const csv = [
      'email,display_name,track_slug,level_code,manager_email',
      `e1-${SUFFIX}@e6.test,Manager One,software-engineering,L3,`,
      `e2-${SUFFIX}@e6.test,Report Two,software-engineering,L2,e1-${SUFFIX}@e6.test`,
      `e3-${SUFFIX}@e6.test,IC Three,software-engineering,L3,`,
      `e4-${SUFFIX}@e6.test,IC Four,software-engineering,L2,e1-${SUFFIX}@e6.test`,
      `e5-${SUFFIX}@e6.test,IC Five,software-engineering,L3,`,
      '',
    ].join('\n');
    importedEmails = [
      `e1-${SUFFIX}@e6.test`,
      `e2-${SUFFIX}@e6.test`,
      `e3-${SUFFIX}@e6.test`,
      `e4-${SUFFIX}@e6.test`,
      `e5-${SUFFIX}@e6.test`,
    ];
    const result = await importSvc.commit(orgA.id, csv, actor);
    assert.equal(result.importedCount, 5);
    assert.equal(result.totalRows, 5);
  });

  test('AC2: each imported employee has the expected (track_id, level_id)', async () => {
    // Stub for GET /v1/map/employees (E10): direct repo-style read +
    // JOIN through users to recover the import-order email.
    const rows = await withOrgScope(prisma, orgA.id, (tx) =>
      tx.employee.findMany({
        where: {
          user: { email: { in: importedEmails } },
        },
        select: {
          id: true,
          careerTrackId: true,
          levelId: true,
          user: { select: { email: true, displayName: true } },
        },
      }),
    );
    assert.equal(rows.length, 5, 'all 5 imported employees must be readable in their own org scope');

    // Expected (track, level) per row.
    const expected = new Map([
      [`e1-${SUFFIX}@e6.test`, { trackId: trackSEId, levelId: levelSEL3Id }],
      [`e2-${SUFFIX}@e6.test`, { trackId: trackSEId, levelId: levelSEL2Id }],
      [`e3-${SUFFIX}@e6.test`, { trackId: trackSEId, levelId: levelSEL3Id }],
      [`e4-${SUFFIX}@e6.test`, { trackId: trackSEId, levelId: levelSEL2Id }],
      [`e5-${SUFFIX}@e6.test`, { trackId: trackSEId, levelId: levelSEL3Id }],
    ]);
    for (const row of rows) {
      const exp = expected.get(row.user.email);
      assert.ok(exp, `unexpected employee with email ${row.user.email}`);
      assert.equal(row.careerTrackId, exp.trackId, `track mismatch for ${row.user.email}`);
      assert.equal(row.levelId, exp.levelId, `level mismatch for ${row.user.email}`);
    }
  });

  test('AC2: manager email in CSV resolves to the in-batch manager_employee_id', async () => {
    // The CSV row for e2 references e1's email as manager_email. After
    // import, e2's EMPLOYEE assignment must carry e1's employee.id as
    // managerEmployeeId. The shape of the manager graph is the data
    // Epic 7+ will use to render the org chart.
    const e1 = await withOrgScope(prisma, orgA.id, (tx) =>
      tx.employee.findFirst({
        where: { user: { email: `e1-${SUFFIX}@e6.test` } },
        select: { id: true },
      }),
    );
    const e2Assignment = await withOrgScope(prisma, orgA.id, (tx) =>
      tx.employeeAssignment.findFirst({
        where: { employee: { user: { email: `e2-${SUFFIX}@e6.test` } } },
        select: { managerEmployeeId: true, role: true },
      }),
    );
    assert.ok(e2Assignment, 'e2 must have an assignment row');
    assert.equal(e2Assignment.role, 'EMPLOYEE');
    assert.equal(e2Assignment.managerEmployeeId, e1.id, 'manager_email must resolve in-batch');
  });

  test('AC2 cross-tenant: org B sees ZERO of org A\'s employees', async () => {
    // Provision a second org with no employees. The RLS policy on the
    // employees table must keep org A's rows invisible from org B's
    // scope. This is the primary security regression test for Epic 6 —
    // the entire bootstrap pipeline only matters if cross-org isolation
    // is intact.
    orgB = await orgsSvc.provision({ slug: SLUG_B, name: 'Epic-6 Org B' });
    const rows = await withOrgScope(prisma, orgB.id, (tx) =>
      tx.employee.findMany({
        where: { user: { email: { in: importedEmails } } },
        select: { id: true },
      }),
    );
    assert.equal(
      rows.length,
      0,
      `org B must see 0 of org A's employees; saw ${rows.length} — RLS leak`,
    );
    // Belt-and-braces: scoping to org B + filtering on org A's id directly.
    const directRows = await withOrgScope(prisma, orgB.id, (tx) =>
      tx.employee.findMany({ where: { organizationId: orgA.id } }),
    );
    assert.equal(directRows.length, 0, 'cross-org filter must be RLS-rejected');
  });

  test('AC1: outbox events landed for org provision + CDF seed + 5 employee imports', async () => {
    // Verify the full audit emission trail. Each story emits a known
    // event type — a regression that dropped any of them would surface
    // here as a count drift.
    //
    // Note: this query is INTENTIONALLY unscoped (no withOrgScope).
    // `outbox_events` is explicitly excluded from RLS by the
    // 20260525_row_level_security migration — it's cross-tenant
    // infrastructure read by the relay worker, not tenant-scoped data.
    const rows = await prisma.outboxEvent.findMany({
      where: { organizationId: orgA.id },
      select: { eventType: true },
    });
    const counts = rows.reduce((acc, r) => {
      acc[r.eventType] = (acc[r.eventType] ?? 0) + 1;
      return acc;
    }, {});
    assert.equal(counts['organization.created'], 1, 'expected exactly one organization.created');
    // configuration.seeded fires once per seeded row. The expected count
    // mirrors CDF_EXPECTED_COUNTS in cdf-defaults.ts: 3 tracks + 10 levels
    // + 30 layers + 30 requirements + 10 promotion rules = 83. Pinning the
    // sum so a drift in cdf-defaults trips this.
    assert.equal(
      counts['configuration.seeded'],
      83,
      'expected 3+10+30+30+10=83 configuration.seeded events (one per CDF row)',
    );
    assert.equal(counts['employee.imported'], 5, 'one event per imported row');
  });

  test('teardown: delete the test orgs', async () => {
    // Two-step delete because users → organization is onDelete: Restrict
    // (Story 6-4 adversarial review identified this). Identity-domain
    // cascades drop role_assignments + employees + employee_assignments
    // when users are deleted; the org delete then drops bootstrap_credentials,
    // recovery_codes, and the entire configuration tree.
    //
    // Each cleanup step is guarded so a partial-failure earlier in the
    // suite (e.g. provision() threw before orgA was assigned) does not
    // mask the original error with a NEW one in teardown — and so
    // that org B is still removed when org A's cleanup throws.
    try {
      if (orgA) {
        await withOrgScope(prisma, orgA.id, (tx) =>
          tx.user.deleteMany({ where: { organizationId: orgA.id } }),
        );
        await prisma.organization.delete({ where: { id: orgA.id } });
      }
    } catch (err) {
      // Log but don't rethrow — we still want orgB cleanup to run.
      console.warn(`teardown: orgA cleanup failed: ${err?.message ?? err}`);
    }
    try {
      if (orgB) {
        await prisma.organization.delete({ where: { id: orgB.id } });
      }
    } catch (err) {
      console.warn(`teardown: orgB cleanup failed: ${err?.message ?? err}`);
    }
    await prisma.$disconnect();
  });
}
