// Story 3-5 AC3 + AC4: three-role scope tests + cross-org isolation.
//
// Boots the api-mode application context, seeds audit_events rows for
// two distinct organizations, and queries the read API as each of the
// three roles. Asserts:
//   - EMPLOYEE sees only events where they are the actor or target
//     (their own row), zero rows from other actors.
//   - MANAGER sees the same self-scope today (team scoping awaits
//     employee_assignments in EPIC-6+; the test documents the current
//     contract).
//   - ADMIN sees every event in their organization.
//   - Cross-org rows NEVER appear under any role.
//
// Skipped when DATABASE_URL is unset or the api dist isn't built.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL;

async function loadPg() {
  try {
    const mod = await import('pg');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

async function loadApp() {
  const [{ NestFactory }, { AppModule }, { AuditService }, { JwtService }] = await Promise.all([
    import('@nestjs/core'),
    import('../../apps/api/dist/app.module.js'),
    import('../../apps/api/dist/audit/audit.service.js'),
    import('../../apps/api/dist/auth/jwt.service.js'),
  ]);
  const appModule = AppModule.register({ mode: 'api' });
  const app = await NestFactory.createApplicationContext(appModule, { bufferLogs: true });
  await app.init();
  return { app, audit: app.get(AuditService), jwt: app.get(JwtService) };
}

async function seed(client, fixture) {
  await client.query(
    `INSERT INTO audit_events (id, organization_id, actor_id, event_type, entity_type, entity_id, occurred_at, after)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      fixture.id,
      fixture.organizationId,
      fixture.actorId,
      fixture.eventType,
      fixture.entityType,
      fixture.entityId,
      fixture.occurredAt,
      JSON.stringify(fixture.after ?? {}),
    ],
  );
}

test('AC3 + AC4: EMPLOYEE / MANAGER / ADMIN scopes + cross-org isolation', async (t) => {
  if (!DATABASE_URL) {
    t.skip('DATABASE_URL not set — RBAC integration test skipped');
    return;
  }
  const pg = await loadPg();
  if (!pg) {
    t.skip('pg client not installed');
    return;
  }
  let app, audit;
  try {
    ({ app, audit } = await loadApp());
  } catch (err) {
    if (/Cannot find module/i.test(String(err))) {
      t.skip('apps/api dist build not present — run `pnpm --filter @fcm/api build` first');
      return;
    }
    throw err;
  }

  const orgA = randomUUID();
  const orgB = randomUUID();
  const employeeA = randomUUID();
  const otherUserA = randomUUID();
  const employeeB = randomUUID();
  const fixtures = [
    // Org A: employeeA's own action (should appear for EMPLOYEE).
    {
      id: randomUUID(),
      organizationId: orgA,
      actorId: employeeA,
      eventType: 'evidence.submitted',
      entityType: 'evidence',
      entityId: randomUUID(),
      occurredAt: new Date('2026-05-10T10:00:00Z'),
    },
    // Org A: a different actor's action targeting employeeA (should appear via entity_id match).
    {
      id: randomUUID(),
      organizationId: orgA,
      actorId: otherUserA,
      eventType: 'evidence.approved',
      entityType: 'evidence',
      entityId: employeeA,
      occurredAt: new Date('2026-05-11T10:00:00Z'),
    },
    // Org A: an action neither involving employeeA — must NOT appear for EMPLOYEE/MANAGER.
    {
      id: randomUUID(),
      organizationId: orgA,
      actorId: otherUserA,
      eventType: 'configuration.changed',
      entityType: 'configuration',
      entityId: randomUUID(),
      occurredAt: new Date('2026-05-12T10:00:00Z'),
    },
    // Org B: a completely separate org's event. Cross-org isolation
    // (AC4) requires this NEVER appears for any actor in org A.
    {
      id: randomUUID(),
      organizationId: orgB,
      actorId: employeeB,
      eventType: 'evidence.submitted',
      entityType: 'evidence',
      entityId: employeeB,
      occurredAt: new Date('2026-05-13T10:00:00Z'),
    },
  ];

  const pgClient = new pg.Client({ connectionString: DATABASE_URL });
  await pgClient.connect();
  try {
    for (const f of fixtures) await seed(pgClient, f);

    // EMPLOYEE (org A) — sees rows 0 (actor) + 1 (entity), not 2 (unrelated), not 3 (cross-org).
    const employeeResult = await audit.list(
      { sub: employeeA, organizationId: orgA, role: 'EMPLOYEE' },
      {},
    );
    const employeeIds = new Set(employeeResult.items.map((r) => r.id));
    assert.ok(employeeIds.has(fixtures[0].id), 'EMPLOYEE must see their own actor event (AC3)');
    assert.ok(employeeIds.has(fixtures[1].id), 'EMPLOYEE must see events targeting them via entity_id (AC3)');
    assert.ok(!employeeIds.has(fixtures[2].id), 'EMPLOYEE must NOT see unrelated org events (AC3)');
    assert.ok(!employeeIds.has(fixtures[3].id), 'EMPLOYEE must NOT see other-org events (AC4 cross-org)');

    // MANAGER (org A) — current implementation is self-only (team scoping
    // deferred to EPIC-6+); same expectations as EMPLOYEE.
    const managerResult = await audit.list(
      { sub: employeeA, organizationId: orgA, role: 'MANAGER' },
      {},
    );
    const managerIds = new Set(managerResult.items.map((r) => r.id));
    assert.ok(managerIds.has(fixtures[0].id));
    assert.ok(managerIds.has(fixtures[1].id));
    assert.ok(!managerIds.has(fixtures[2].id), 'MANAGER (no team table yet) must NOT see unrelated events (AC3)');
    assert.ok(!managerIds.has(fixtures[3].id), 'MANAGER must NOT see other-org events (AC4)');

    // ADMIN (org A) — sees all three org-A events, none from org B.
    const adminResult = await audit.list(
      { sub: randomUUID(), organizationId: orgA, role: 'ADMIN' },
      {},
    );
    const adminIds = new Set(adminResult.items.map((r) => r.id));
    assert.ok(adminIds.has(fixtures[0].id));
    assert.ok(adminIds.has(fixtures[1].id));
    assert.ok(adminIds.has(fixtures[2].id), 'ADMIN must see every org-A event (AC3)');
    assert.ok(!adminIds.has(fixtures[3].id), 'ADMIN must NOT see other-org events (AC4 cross-org)');
  } finally {
    // audit_events is append-only — these seed rows stay until partition
    // pruning eventually catches them. Acceptable for integration test scope.
    await pgClient.end();
    await app.close();
  }
});

test('Cursor pagination round-trips a multi-page result', async (t) => {
  if (!DATABASE_URL) {
    t.skip('DATABASE_URL not set');
    return;
  }
  const pg = await loadPg();
  if (!pg) {
    t.skip('pg not installed');
    return;
  }
  let app, audit;
  try {
    ({ app, audit } = await loadApp());
  } catch (err) {
    if (/Cannot find module/i.test(String(err))) {
      t.skip('apps/api dist build not present');
      return;
    }
    throw err;
  }
  const org = randomUUID();
  const actor = randomUUID();
  const pgClient = new pg.Client({ connectionString: DATABASE_URL });
  await pgClient.connect();
  try {
    for (let i = 0; i < 5; i++) {
      await seed(pgClient, {
        id: randomUUID(),
        organizationId: org,
        actorId: actor,
        eventType: 'evidence.submitted',
        entityType: 'evidence',
        entityId: randomUUID(),
        occurredAt: new Date(`2026-05-${10 + i}T10:00:00Z`),
      });
    }
    const page1 = await audit.list(
      { sub: actor, organizationId: org, role: 'EMPLOYEE' },
      { limit: 2 },
    );
    assert.equal(page1.items.length, 2);
    assert.ok(page1.nextCursor, 'first page must include a nextCursor');
    const page2 = await audit.list(
      { sub: actor, organizationId: org, role: 'EMPLOYEE' },
      { limit: 2, cursor: page1.nextCursor },
    );
    assert.equal(page2.items.length, 2);
    const seen = new Set([...page1.items, ...page2.items].map((r) => r.id));
    assert.equal(seen.size, 4, 'pages must not overlap');
  } finally {
    await pgClient.end();
    await app.close();
  }
});
