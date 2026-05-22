// Story 6-5 AC1–AC6: EmployeeImportService validation + commit.
//
// The service composes parser + lookups + single-transaction batch
// writes. We use an in-memory Prisma fake that faithfully implements:
//   • $transaction(fn) — runs the lambda with one tx client, rolls
//     back all in-memory state if the lambda throws (the AC6
//     atomicity guarantee).
//   • user.create — enforces (organizationId, email) uniqueness AND
//     raises Prisma.PrismaClientKnownRequestError(P2002) on conflict
//     (the production failure mode the service catches).
//   • employee.create / employeeAssignment.create — append-only.
//   • outboxEvent.create — captured for audit-emission assertions.
//   • $executeRaw — no-op (withOrgScope's SET LOCAL).
//   • findMany on career_track / level / user / employee — return
//     the pre-seeded fixtures.
//
// The fake's atomicity matters: a row-N P2002 must roll back rows
// 0..N-1. Without that, the AC6 test would pass against a fake but
// fail against real Postgres.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { EmployeeImportService } = await import('../dist/identity/employee-import.service.js');
const { Prisma } = await import('@prisma/client');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRACK_SE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TRACK_ARCH_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LEVEL_SE_L2_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LEVEL_SE_L3_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const LEVEL_ARCH_L4_ID = '11111111-1111-4111-8111-111111111111';

const ACTOR = {
  user_id: ADMIN_ID,
  organization_id: ORG_ID,
  role: 'ADMIN',
  display_name: 'Admin User',
};

function makeFakePrisma({
  tracks = [
    { id: TRACK_SE_ID, slug: 'software-engineering' },
    { id: TRACK_ARCH_ID, slug: 'architecture' },
  ],
  levels = [
    { id: LEVEL_SE_L2_ID, levelCode: 'L2', careerTrackId: TRACK_SE_ID },
    { id: LEVEL_SE_L3_ID, levelCode: 'L3', careerTrackId: TRACK_SE_ID },
    { id: LEVEL_ARCH_L4_ID, levelCode: 'L4', careerTrackId: TRACK_ARCH_ID },
  ],
  initialUsers = [],
  initialEmployees = [],
  failOnUserCreateEmail = null,
} = {}) {
  // Persistent state OUTSIDE any transaction — read by findMany,
  // appended by create() inside the tx but ONLY committed on
  // successful tx completion.
  const committedUsers = [...initialUsers];
  const committedEmployees = [...initialEmployees];
  let uuidCounter = 0;
  const calls = {
    userCreate: [],
    employeeCreate: [],
    employeeAssignmentCreate: [],
    outboxCreate: [],
    transactionCount: 0,
    transactionsRolledBack: 0,
  };

  // Tiny helper: produce a UUID v4-shaped string each call. The audit
  // schema validates entityId/userId etc as UUIDs (8-4-4-4-12 hex), and
  // a non-UUID id would fail the relay parse. We make IDs deterministic
  // on a per-fake basis so test failures are diff-stable.
  function makeUuid(prefix) {
    const pad = prefix.repeat(2); // single-char prefix → 2-char block
    const block8 = pad + pad + pad + pad;
    const block4 = pad + pad;
    const ord = (++uuidCounter).toString(16).padStart(12, '0');
    return `${block8}-${block4}-4${prefix.repeat(3)}-8${prefix.repeat(3)}-${ord}`;
  }

  function makeTx() {
    // Buffered (uncommitted) state for THIS transaction.
    const txUsers = [];
    const txEmployees = [];
    const txAssignments = [];
    const txOutbox = [];
    const tx = {
      careerTrack: {
        findMany: async () => tracks,
      },
      level: {
        findMany: async () => levels,
      },
      user: {
        findMany: async () => committedUsers,
        create: async (args) => {
          calls.userCreate.push(args);
          // Faithful P2002: a duplicate (organizationId, email) raises
          // the same Prisma error shape the catch arm in the service
          // expects.
          const dup =
            committedUsers.find(
              (u) =>
                u.organizationId === args.data.organizationId &&
                u.email.toLowerCase() === args.data.email.toLowerCase(),
            ) ||
            txUsers.find(
              (u) =>
                u.organizationId === args.data.organizationId &&
                u.email.toLowerCase() === args.data.email.toLowerCase(),
            );
          if (dup) {
            throw new Prisma.PrismaClientKnownRequestError(
              `Unique constraint failed on the fields: (organizationId,email)`,
              { code: 'P2002', clientVersion: 'test', meta: { target: ['organizationId', 'email'] } },
            );
          }
          if (failOnUserCreateEmail && args.data.email === failOnUserCreateEmail) {
            // Inject a non-P2002 failure mid-batch to prove AC6
            // rollback: tx state is dropped, prior rows do not commit.
            throw new Error(`injected failure on user.create for ${args.data.email}`);
          }
          const row = {
            id: makeUuid('a'),
            organizationId: args.data.organizationId,
            email: args.data.email,
            displayName: args.data.displayName,
          };
          txUsers.push(row);
          return row;
        },
      },
      employee: {
        findMany: async () => committedEmployees,
        create: async (args) => {
          calls.employeeCreate.push(args);
          const row = {
            id: makeUuid('b'),
            organizationId: args.data.organizationId,
            userId: args.data.userId,
            careerTrackId: args.data.careerTrackId,
            levelId: args.data.levelId,
            assignedAt: args.data.assignedAt,
          };
          txEmployees.push(row);
          return row;
        },
      },
      employeeAssignment: {
        create: async (args) => {
          calls.employeeAssignmentCreate.push(args);
          const row = {
            id: makeUuid('c'),
            ...args.data,
          };
          txAssignments.push(row);
          return row;
        },
      },
      outboxEvent: {
        create: async (args) => {
          calls.outboxCreate.push(args);
          txOutbox.push(args.data);
          return args.data;
        },
      },
      $executeRaw: async () => 0,
    };
    return { tx, commit: () => {
      committedUsers.push(...txUsers);
      committedEmployees.push(...txEmployees);
    }, rollback: () => {
      // Drop tx-buffered state by not committing it. The captured
      // `calls.*` arrays remain, but the assertion is "no DB state
      // landed", which the *committed* arrays prove.
    } };
  }

  const prisma = {
    $transaction: async (fn) => {
      calls.transactionCount += 1;
      const { tx, commit, rollback } = makeTx();
      try {
        const out = await fn(tx);
        commit();
        return out;
      } catch (err) {
        calls.transactionsRolledBack += 1;
        rollback();
        throw err;
      }
    },
  };
  return {
    prisma,
    calls,
    state: { committedUsers, committedEmployees },
  };
}

// ── AC2: dry-run preview ────────────────────────────────────────────

test('AC2: dryRun parses + validates without writing', async () => {
  const csv =
    'email,display_name,track_slug,level_code,manager_email\n' +
    'jdoe@example.com,Jane Doe,software-engineering,L2,\n';
  const { prisma, calls } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, csv);

  assert.equal(report.totalRows, 1);
  assert.equal(report.validRows, 1);
  assert.equal(report.errors.length, 0);
  assert.equal(report.preview[0].email, 'jdoe@example.com');
  assert.equal(report.preview[0].careerTrackId, TRACK_SE_ID);
  assert.equal(report.preview[0].levelId, LEVEL_SE_L2_ID);

  // Pin AC2's no-writes guarantee: dryRun must not call any create.
  assert.equal(calls.userCreate.length, 0, 'dryRun must NOT write user rows');
  assert.equal(calls.employeeCreate.length, 0, 'dryRun must NOT write employee rows');
  assert.equal(calls.outboxCreate.length, 0, 'dryRun must NOT emit audit events');
});

// ── AC1 + AC3: commit creates rows + emits audit events ─────────────

test('AC1+AC3: commit creates user+employee+assignment per row and emits employee.imported', async () => {
  const csv =
    'email,display_name,track_slug,level_code,manager_email\n' +
    'jdoe@example.com,Jane Doe,software-engineering,L2,\n' +
    'asmith@example.com,Alex Smith,software-engineering,L3,jdoe@example.com\n';
  const { prisma, calls } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  const result = await svc.commit(ORG_ID, csv, ACTOR);

  assert.equal(result.importedCount, 2);
  assert.equal(result.totalRows, 2);
  assert.equal(result.employees.length, 2);
  assert.equal(calls.userCreate.length, 2);
  assert.equal(calls.employeeCreate.length, 2);
  assert.equal(calls.employeeAssignmentCreate.length, 2, 'every imported row gets one assignment');
  assert.equal(calls.outboxCreate.length, 2, 'AC3: one audit event per row');
  // AC6 atomicity is verified by the dedicated rollback test below;
  // a multi-tx invocation here is expected because the validate phase
  // opens read-only transactions for the track / level / user / employee
  // lookups before the single write transaction commits the batch.
  assert.equal(calls.transactionsRolledBack, 0, 'happy-path commit must NOT roll back');

  // The second row's manager_email points at the first row's email —
  // the in-batch resolution must produce a non-null managerEmployeeId
  // on the second assignment.
  const assignments = calls.employeeAssignmentCreate;
  assert.equal(assignments[0].data.managerEmployeeId, null, 'first row has no manager');
  assert.notEqual(
    assignments[1].data.managerEmployeeId,
    null,
    'second row resolves manager_email to the first row',
  );

  // AC3: the audit event payload validates against the AuditEvent taxonomy.
  for (const outbox of calls.outboxCreate) {
    const data = outbox.data;
    assert.equal(data.eventType, 'employee.imported');
    assert.equal(data.aggregateType, 'employee');
    assert.equal(data.payload.actorId, ADMIN_ID);
    const candidate = {
      eventId: data.eventId,
      occurredAt: new Date().toISOString(),
      actorId: null,
      organizationId: data.organizationId,
      entityType: data.aggregateType,
      entityId: data.aggregateId,
      eventType: data.eventType,
      ...data.payload,
    };
    const parsed = safeParseAuditEvent(candidate);
    assert.equal(parsed.ok, true, `relay would reject: ${JSON.stringify(parsed)}`);
  }
});

// ── AC4: manager_email resolution ───────────────────────────────────

test('AC4: manager_email resolves to an existing employee', async () => {
  // The manager already exists in the org from a prior CSV import.
  const BOSS_USER_ID = '99999999-9999-4999-8999-999999999999';
  const BOSS_EMP_ID = '88888888-8888-4888-8888-888888888888';
  const csv =
    'email,display_name,track_slug,level_code,manager_email\n' +
    'newhire@example.com,New Hire,,,boss@example.com\n';
  const { prisma } = makeFakePrisma({
    initialUsers: [
      { id: BOSS_USER_ID, organizationId: ORG_ID, email: 'boss@example.com', displayName: 'Boss' },
    ],
    initialEmployees: [{ id: BOSS_EMP_ID, userId: BOSS_USER_ID }],
  });
  const svc = new EmployeeImportService(prisma);
  const result = await svc.commit(ORG_ID, csv, ACTOR);
  assert.equal(result.importedCount, 1);
});

test('AC4: manager_email that does not resolve is rejected with a structured error', async () => {
  // The manager isn't in the org and isn't earlier in the CSV.
  const csv =
    'email,display_name,track_slug,level_code,manager_email\n' +
    'newhire@example.com,New Hire,,,ghost@example.com\n';
  const { prisma } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, csv);
  assert.equal(report.validRows, 0);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].row, 2);
  assert.equal(report.errors[0].field, 'manager_email');
  assert.match(report.errors[0].reason, /does not match/);
});

test('AC4: forward reference (manager appears LATER in CSV) is rejected', async () => {
  // The roster CSV must be in topological order. A manager that
  // appears AFTER its report cannot be resolved at commit time
  // because we process rows in order.
  const csv =
    'email,display_name,track_slug,level_code,manager_email\n' +
    'a@example.com,A,,,b@example.com\n' +
    'b@example.com,B,,,\n';
  const { prisma } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, csv);
  assert.equal(report.validRows, 1, 'only the manager row (B) should validate');
  assert.equal(report.errors[0].row, 2);
  assert.equal(report.errors[0].field, 'manager_email');
});

// ── AC5: structured validation report ───────────────────────────────

test('AC5: validation errors report row + field + reason', async () => {
  const csv =
    'email,display_name,track_slug,level_code,manager_email\n' +
    'not-an-email,Jane,software-engineering,L2,\n' +
    'jdoe@example.com,,software-engineering,L2,\n' +
    'asmith@example.com,Alex,bad-track,L2,\n' +
    'mfoo@example.com,Mike,software-engineering,L99,\n';
  const { prisma } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, csv);

  assert.equal(report.totalRows, 4);
  assert.equal(report.validRows, 0);
  assert.equal(report.errors.length, 4);

  const byField = Object.fromEntries(report.errors.map((e) => [e.field, e]));
  assert.ok(byField['email']);
  assert.equal(byField['email'].row, 2);
  assert.ok(byField['display_name']);
  assert.equal(byField['display_name'].row, 3);
  assert.ok(byField['track_slug']);
  assert.equal(byField['track_slug'].row, 4);
  assert.ok(byField['level_code']);
  assert.equal(byField['level_code'].row, 5);
});

test('AC5: rejects header drift', async () => {
  // A misspelled header column should NOT silently proceed — the
  // commit would otherwise put data in the wrong columns.
  const csv =
    'email,displayname,track_slug,level_code,manager_email\n' +
    'jdoe@example.com,Jane Doe,software-engineering,L2,\n';
  const { prisma } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, csv);
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].row, 1);
  assert.equal(report.errors[0].field, 'csv');
  assert.match(report.errors[0].reason, /expected "display_name"/);
});

test('AC5: rejects an employee whose email equals their own manager_email', async () => {
  // Edge case that the operator might typo. Without an explicit
  // guard, the row would pass shape validation, the manager_email
  // would resolve at commit time (the employee created themselves),
  // and we'd end up with a self-reporting cycle in the manager graph.
  const csv =
    'email,display_name,track_slug,level_code,manager_email\n' +
    'jdoe@example.com,Jane Doe,,,jdoe@example.com\n';
  const { prisma } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, csv);
  assert.equal(report.validRows, 0);
  assert.equal(report.errors[0].field, 'manager_email');
  assert.match(report.errors[0].reason, /own manager/);
});

test('AC5: rejects duplicate emails within the CSV', async () => {
  const csv =
    'email,display_name,track_slug,level_code,manager_email\n' +
    'jdoe@example.com,Jane,,,\n' +
    'jdoe@example.com,Jane Two,,,\n';
  const { prisma } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, csv);
  assert.equal(report.validRows, 1);
  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0].reason, /duplicate email/);
});

test('AC5: rejects an email that collides with a pre-existing user', async () => {
  const csv =
    'email,display_name,track_slug,level_code,manager_email\n' +
    'existing@example.com,Jane,,,\n';
  const EXISTING_ID = '77777777-7777-4777-8777-777777777777';
  const { prisma } = makeFakePrisma({
    initialUsers: [
      { id: EXISTING_ID, organizationId: ORG_ID, email: 'existing@example.com', displayName: 'Existing' },
    ],
  });
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, csv);
  assert.equal(report.errors[0].field, 'email');
  assert.match(report.errors[0].reason, /already exists/);
});

// ── AC6: rollback on commit failure ─────────────────────────────────

test('AC6: a mid-batch failure rolls the WHOLE batch back', async () => {
  // 10 valid rows. We inject a failure on the 7th row's user.create.
  // The whole tx must roll back; the committed-state arrays must be
  // empty afterward.
  const headers = 'email,display_name,track_slug,level_code,manager_email';
  const rows = Array.from({ length: 10 }, (_, i) =>
    `u${i}@example.com,User ${i},,,`,
  );
  const csv = [headers, ...rows].join('\n') + '\n';
  const { prisma, calls, state } = makeFakePrisma({
    failOnUserCreateEmail: 'u6@example.com', // 7th row (0-indexed)
  });
  const svc = new EmployeeImportService(prisma);
  let threw = false;
  try {
    await svc.commit(ORG_ID, csv, ACTOR);
  } catch (err) {
    threw = true;
    assert.match(err.message ?? '', /injected failure/);
  }
  assert.ok(threw, 'commit must propagate the failure');
  assert.equal(calls.transactionsRolledBack, 1);
  // Pin AC6: NO state was committed despite 6 successful inserts
  // before the failure. The fake's commit/rollback model the same
  // boundary real Postgres provides.
  assert.equal(state.committedUsers.length, 0);
  assert.equal(state.committedEmployees.length, 0);
});

test('AC6 integration shape: 10 valid + 3 invalid → 400 with structured report; no writes', async () => {
  // AC6 explicitly calls out this scenario. We don't run a real
  // tx — the validation phase short-circuits before commit reaches
  // the DB.
  const validRows = Array.from({ length: 10 }, (_, i) =>
    `u${i}@example.com,User ${i},,,`,
  );
  const invalidRows = [
    'not-an-email,No Email Shape,,,',
    'noname@example.com,,,,',
    'badmgr@example.com,Bad Manager,,,ghost@example.com',
  ];
  const csv = [
    'email,display_name,track_slug,level_code,manager_email',
    ...validRows,
    ...invalidRows,
  ].join('\n') + '\n';
  const { prisma, calls } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  let threw = false;
  try {
    await svc.commit(ORG_ID, csv, ACTOR);
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 400);
    const body = err.getResponse();
    assert.equal(body.report.totalRows, 13);
    assert.equal(body.report.validRows, 10);
    assert.equal(body.report.errors.length, 3);
  }
  assert.ok(threw);
  // No writes from a failed validation pass. The validate phase opens
  // read-only transactions for lookups, but no user/employee/outbox
  // creates should land.
  assert.equal(calls.userCreate.length, 0);
  assert.equal(calls.employeeCreate.length, 0);
  assert.equal(calls.outboxCreate.length, 0);
});

// ── Edge cases ──────────────────────────────────────────────────────

test('empty CSV body returns a clean structured error', async () => {
  const { prisma } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, '');
  assert.equal(report.errors[0].field, 'csv');
});

test('CSV with only a header (no data rows) returns a clean structured error', async () => {
  const { prisma } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, 'email,display_name,track_slug,level_code,manager_email\n');
  assert.equal(report.errors[0].field, 'csv');
  assert.match(report.errors[0].reason, /no data rows/);
});

test('level_code without track_slug is rejected', async () => {
  // The same level_code (e.g. L2) exists in multiple tracks. Without
  // a track to disambiguate, the operator's intent is ambiguous —
  // refuse rather than guess.
  const csv =
    'email,display_name,track_slug,level_code,manager_email\n' +
    'jdoe@example.com,Jane,,L2,\n';
  const { prisma } = makeFakePrisma();
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, csv);
  assert.equal(report.errors[0].field, 'level_code');
  assert.match(report.errors[0].reason, /requires a track_slug/);
});

test('emails are case-insensitive (lowercased before comparison)', async () => {
  // CSV row email is "JDoe@Example.COM"; existing-user check must
  // match against "jdoe@example.com" since real email systems treat
  // these as equivalent.
  const csv =
    'email,display_name,track_slug,level_code,manager_email\n' +
    'JDoe@Example.COM,Jane,,,\n';
  const EXISTING_ID = '77777777-7777-4777-8777-777777777777';
  const { prisma } = makeFakePrisma({
    initialUsers: [
      { id: EXISTING_ID, organizationId: ORG_ID, email: 'jdoe@example.com', displayName: 'X' },
    ],
  });
  const svc = new EmployeeImportService(prisma);
  const report = await svc.dryRun(ORG_ID, csv);
  assert.equal(report.errors[0].field, 'email');
  assert.match(report.errors[0].reason, /already exists/);
});
