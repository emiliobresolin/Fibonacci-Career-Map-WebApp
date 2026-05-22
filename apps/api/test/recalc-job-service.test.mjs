// Story 4-3 — RecalcJobService.claim() contract.
//
// AC1 is asserted by the migration (schema-level — only verifiable
// against a real DB; the rls-integration suite at apps/api/test/
// rls-integration.test.mjs is the analog for those table-level checks).
//
// AC2 + AC3 are exercised here against a mock Prisma client. We
// simulate three claim outcomes:
//   • first-time call → INSERT pending row
//   • concurrent-claim race → unique-index P2002 then re-read
//   • already-completed → AlreadyCompletedError
// plus the documented "previously-failed → PreviouslyFailedError" path.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { RecalcJobService, AlreadyCompletedError, PreviouslyFailedError } = await import(
  '../dist/jobs/recalc-job.service.js'
);

const ORG = '11111111-1111-1111-1111-111111111111';
const EMPLOYEE = '22222222-2222-2222-2222-222222222222';
const EVENT = '33333333-3333-3333-3333-333333333333';

class P2002Error extends Error {
  constructor() {
    super('Unique constraint failed');
    this.code = 'P2002';
  }
}

// Hook the runtime check `err instanceof Prisma.PrismaClientKnownRequestError`.
// The service imports `Prisma` from '@prisma/client'; the instanceof check
// passes only for actual Prisma errors. We monkey-patch via prototype
// inheritance so our stub satisfies it.
const { Prisma } = await import('@prisma/client');
Object.setPrototypeOf(P2002Error.prototype, Prisma.PrismaClientKnownRequestError.prototype);

function makePrisma({ existingRow = null, createBehavior = 'success', findUniqueResult = null } = {}) {
  // Faithful-mock state: once Postgres aborts a transaction (e.g. via
  // a constraint violation), every subsequent query raises 25P02
  // "current transaction is aborted" until ROLLBACK TO SAVEPOINT
  // restores the txn to a healthy state. The mock mirrors that so a
  // service that forgets the savepoint dance fails the test.
  let txAborted = false;
  const captured = [];
  return {
    _captured: captured,
    $transaction: async (fn) => {
      const tx = {
        $queryRaw: async (strings, ...params) => {
          if (txAborted) throw new Error('25P02 current transaction is aborted');
          captured.push({ kind: 'queryRaw', sql: strings.join('?'), params });
          return existingRow ? [existingRow] : [];
        },
        $executeRaw: async (strings, ...params) => {
          const sql = strings.join('?');
          // Postgres allows SAVEPOINT / RELEASE / ROLLBACK TO SAVEPOINT
          // statements inside an aborted transaction — they're the only
          // way to recover. Regular queries still 25P02.
          const isSavepointStmt = /\b(SAVEPOINT|RELEASE\s+SAVEPOINT|ROLLBACK\s+TO\s+SAVEPOINT)\b/i.test(sql);
          if (txAborted && !isSavepointStmt) {
            throw new Error('25P02 current transaction is aborted');
          }
          captured.push({ kind: 'execRaw', sql, params });
          if (/ROLLBACK\s+TO\s+SAVEPOINT/i.test(sql)) {
            // The savepoint rollback restores txn health.
            txAborted = false;
          }
          return 0;
        },
        recalcJob: {
          create: async ({ data }) => {
            if (txAborted) throw new Error('25P02 current transaction is aborted');
            captured.push({ kind: 'create', data });
            if (createBehavior === 'p2002') {
              // Real PG behavior: constraint violation marks the txn
              // aborted. Subsequent queries fail until ROLLBACK TO SAVEPOINT.
              txAborted = true;
              throw new P2002Error();
            }
            return {
              id: 'new-job-id',
              organizationId: data.organizationId,
              employeeId: data.employeeId,
              triggeringEventId: data.triggeringEventId,
              status: 'pending',
              createdAt: new Date('2026-05-22T10:00:00Z'),
              completedAt: null,
            };
          },
          findUnique: async () => {
            if (txAborted) throw new Error('25P02 current transaction is aborted');
            return findUniqueResult;
          },
          update: async () => {
            if (txAborted) throw new Error('25P02 current transaction is aborted');
            return {};
          },
        },
      };
      return fn(tx);
    },
  };
}

test('AC2: first-time claim inserts a pending row and returns it', async () => {
  const svc = new RecalcJobService(makePrisma({ existingRow: null }));
  const row = await svc.claim({
    organizationId: ORG,
    employeeId: EMPLOYEE,
    triggeringEventId: EVENT,
  });
  assert.equal(row.status, 'pending');
  assert.equal(row.employeeId, EMPLOYEE);
  assert.equal(row.triggeringEventId, EVENT);
});

test('AC2: claim throws AlreadyCompletedError when row is already completed', async () => {
  const svc = new RecalcJobService(
    makePrisma({
      existingRow: {
        id: 'existing-id',
        organizationId: ORG,
        employeeId: EMPLOYEE,
        triggeringEventId: EVENT,
        status: 'completed',
        createdAt: new Date(),
        completedAt: new Date(),
      },
    }),
  );
  await assert.rejects(
    () => svc.claim({ organizationId: ORG, employeeId: EMPLOYEE, triggeringEventId: EVENT }),
    AlreadyCompletedError,
  );
});

test('AC2: claim throws PreviouslyFailedError when row is failed (operator action required)', async () => {
  const svc = new RecalcJobService(
    makePrisma({
      existingRow: {
        id: 'existing-id',
        organizationId: ORG,
        employeeId: EMPLOYEE,
        triggeringEventId: EVENT,
        status: 'failed',
        createdAt: new Date(),
        completedAt: new Date(),
      },
    }),
  );
  await assert.rejects(
    () => svc.claim({ organizationId: ORG, employeeId: EMPLOYEE, triggeringEventId: EVENT }),
    PreviouslyFailedError,
  );
});

test('AC2: claim returns the existing pending row when a previous attempt crashed mid-flight', async () => {
  const svc = new RecalcJobService(
    makePrisma({
      existingRow: {
        id: 'crashed-job-id',
        organizationId: ORG,
        employeeId: EMPLOYEE,
        triggeringEventId: EVENT,
        status: 'pending',
        createdAt: new Date('2026-05-22T09:00:00Z'),
        completedAt: null,
      },
    }),
  );
  const row = await svc.claim({
    organizationId: ORG,
    employeeId: EMPLOYEE,
    triggeringEventId: EVENT,
  });
  assert.equal(row.id, 'crashed-job-id');
  assert.equal(row.status, 'pending');
});

test('AC3 race: concurrent-claim race resolved via SAVEPOINT + P2002 + survivor re-read', async () => {
  // First SELECT FOR UPDATE returns no row (we win the lock), but the
  // INSERT raises P2002 because another transaction beat us. The mock
  // also marks the txn aborted (faithful to PG semantics) — the service
  // MUST issue ROLLBACK TO SAVEPOINT before re-reading, else findUnique
  // would raise "25P02 current transaction is aborted".
  const prisma = makePrisma({
    existingRow: null,
    createBehavior: 'p2002',
    findUniqueResult: {
      id: 'survivor-id',
      organizationId: ORG,
      employeeId: EMPLOYEE,
      triggeringEventId: EVENT,
      status: 'pending',
      createdAt: new Date(),
      completedAt: null,
    },
  });
  const svc = new RecalcJobService(prisma);
  const row = await svc.claim({
    organizationId: ORG,
    employeeId: EMPLOYEE,
    triggeringEventId: EVENT,
  });
  assert.equal(row.id, 'survivor-id');
  assert.equal(row.status, 'pending');
  // Verify the SAVEPOINT dance happened.
  const sql = prisma._captured.map((c) => c.sql || c.kind);
  assert.ok(
    sql.some((s) => /SAVEPOINT claim_insert/i.test(s)),
    `expected SAVEPOINT issued before INSERT; saw: ${sql.join(' | ')}`,
  );
  assert.ok(
    sql.some((s) => /ROLLBACK TO SAVEPOINT claim_insert/i.test(s)),
    `expected ROLLBACK TO SAVEPOINT after P2002; saw: ${sql.join(' | ')}`,
  );
});

test('AC3 race: concurrent-claim race that produced a completed survivor → AlreadyCompletedError', async () => {
  const svc = new RecalcJobService(
    makePrisma({
      existingRow: null,
      createBehavior: 'p2002',
      findUniqueResult: {
        id: 'survivor-id',
        organizationId: ORG,
        employeeId: EMPLOYEE,
        triggeringEventId: EVENT,
        status: 'completed',
        createdAt: new Date(),
        completedAt: new Date(),
      },
    }),
  );
  await assert.rejects(
    () => svc.claim({ organizationId: ORG, employeeId: EMPLOYEE, triggeringEventId: EVENT }),
    AlreadyCompletedError,
  );
});

test('AlreadyCompletedError carries code + ids for triage', () => {
  const e = new AlreadyCompletedError(EMPLOYEE, EVENT);
  assert.equal(e.code, 'RECALC_ALREADY_COMPLETED');
  assert.equal(e.employeeId, EMPLOYEE);
  assert.equal(e.triggeringEventId, EVENT);
  assert.ok(e instanceof AlreadyCompletedError);
  assert.ok(e instanceof Error);
});

test('PreviouslyFailedError carries code + ids for triage', () => {
  const e = new PreviouslyFailedError(EMPLOYEE, EVENT);
  assert.equal(e.code, 'RECALC_PREVIOUSLY_FAILED');
  assert.equal(e.employeeId, EMPLOYEE);
  assert.equal(e.triggeringEventId, EVENT);
});
