// Story 6-4 AC3: BootstrapCredentialsService emits outbox audit events.
//
// `provision()` emits `bootstrap_admin.provisioned` inside the same
// withOrgScope tx that writes user + role_assignment + bootstrap_credential.
// `disable()` emits `bootstrap_admin.disabled` ONLY on the first transition
// (idempotent: a repeated call against an already-disabled row is a no-op
// and emits nothing).
//
// We use a capturing fake of PrismaService so the test runs without a live
// DB. The fake mirrors Prisma's transactional semantics: every call inside
// the withOrgScope $transaction lambda gets the same `tx` proxy, so the
// audit emit is observably co-located with the row writes. Outbox payloads
// are then reconstructed exactly the way the relay (outbox-relay.consumer.ts)
// would and validated against the AuditEvent taxonomy — a drift either way
// trips the assertion.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BootstrapCredentialsService } = await import(
  '../dist/auth/bootstrap-credentials.service.js'
);
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CRED_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ADMIN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** Build a fake Prisma that observes every call and lets the test inject
 *  the row shapes used by the service. The fake intentionally does NOT
 *  simulate rollback — assertions on outbox emission inside the tx are
 *  what matter; the real Postgres provides true rollback. */
function makeFakePrisma({ existingCredential = null } = {}) {
  const calls = {
    userCreate: [],
    roleAssignmentCreate: [],
    bootstrapCredentialCreate: [],
    bootstrapCredentialFindUnique: [],
    bootstrapCredentialUpdateMany: [],
    outboxCreate: [],
    setRls: [],
    txCount: 0,
  };
  let credentialState = existingCredential;
  const tx = {
    user: {
      create: async (args) => {
        calls.userCreate.push(args);
        return { id: USER_ID, ...args.data };
      },
    },
    roleAssignment: {
      create: async (args) => {
        calls.roleAssignmentCreate.push(args);
        return { id: 'role-' + USER_ID, ...args.data };
      },
    },
    bootstrapCredential: {
      create: async (args) => {
        calls.bootstrapCredentialCreate.push(args);
        credentialState = {
          id: CRED_ID,
          organizationId: args.data.organizationId,
          username: args.data.username,
          passwordHash: args.data.passwordHash,
          disabledAt: null,
        };
        return credentialState;
      },
      findUnique: async (args) => {
        calls.bootstrapCredentialFindUnique.push(args);
        return credentialState;
      },
      // Faithful to Prisma's conditional-updateMany semantics: only
      // rows matching the WHERE clause are updated; returns { count }.
      // The service relies on count === 1 vs 0 to decide whether to
      // emit audit (race-safety against concurrent disable() calls).
      updateMany: async (args) => {
        calls.bootstrapCredentialUpdateMany.push(args);
        // Match the where filter: { organizationId, disabledAt: null }.
        const matches =
          credentialState &&
          credentialState.organizationId === args.where.organizationId &&
          (args.where.disabledAt === null
            ? credentialState.disabledAt === null
            : true);
        if (!matches) return { count: 0 };
        credentialState = { ...credentialState, ...args.data };
        return { count: 1 };
      },
    },
    outboxEvent: {
      create: async (args) => {
        calls.outboxCreate.push(args);
        return args.data;
      },
    },
    $executeRaw: async (...args) => {
      // withOrgScope uses $executeRaw to SET LOCAL app.current_org_id.
      // Capture for diagnostics; the value doesn't matter for unit tests.
      calls.setRls.push(args);
      return 0;
    },
  };
  const prisma = {
    $transaction: async (fn) => {
      calls.txCount += 1;
      return await fn(tx);
    },
  };
  return { prisma, calls };
}

// ── provision() ──────────────────────────────────────────────────────

test('AC3: provision() emits bootstrap_admin.provisioned outbox event in the same tx', async () => {
  const { prisma, calls } = makeFakePrisma();
  const svc = new BootstrapCredentialsService(prisma);
  const result = await svc.provision(ORG_ID);

  // Three rows + one audit emit = four writes in one tx.
  assert.equal(calls.txCount, 1, 'all writes must commit in a single transaction');
  assert.equal(calls.userCreate.length, 1);
  assert.equal(calls.roleAssignmentCreate.length, 1);
  assert.equal(calls.bootstrapCredentialCreate.length, 1);
  assert.equal(calls.outboxCreate.length, 1, 'AC3: exactly one outbox emit per provision');

  // Result shape: plaintext credentials returned once.
  assert.equal(typeof result.username, 'string');
  assert.equal(typeof result.password, 'string');
  assert.equal(result.userId, USER_ID);
  assert.ok(result.password.length >= 16, 'plaintext password should be ≥16 chars (entropy floor)');

  // Outbox row shape pins the producer contract.
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'bootstrap_admin.provisioned');
  assert.equal(outbox.aggregateType, 'bootstrap_credential');
  assert.equal(outbox.aggregateId, CRED_ID, 'aggregateId must point at the credential row');
  assert.equal(outbox.organizationId, ORG_ID);
  assert.equal(outbox.payload.actorId, null, 'bootstrap is system-actor');
  assert.equal(outbox.payload.after.userId, USER_ID);
  assert.equal(outbox.payload.after.username, result.username);
});

test('AC3: provision outbox payload validates against AuditEvent taxonomy', async () => {
  const { prisma, calls } = makeFakePrisma();
  const svc = new BootstrapCredentialsService(prisma);
  await svc.provision(ORG_ID);
  const outbox = calls.outboxCreate[0].data;
  // Reconstruct the candidate the relay would build at fanout time
  // (outbox-relay.consumer.ts:146-155 spread order).
  const candidate = {
    eventId: outbox.eventId,
    occurredAt: new Date().toISOString(),
    actorId: null,
    organizationId: outbox.organizationId,
    entityType: outbox.aggregateType,
    entityId: outbox.aggregateId,
    eventType: outbox.eventType,
    ...outbox.payload,
  };
  const parsed = safeParseAuditEvent(candidate);
  assert.equal(parsed.ok, true, `relay would reject the payload: ${JSON.stringify(parsed)}`);
  if (parsed.ok) {
    assert.equal(parsed.event.eventType, 'bootstrap_admin.provisioned');
    assert.equal(parsed.event.entityType, 'bootstrap_credential');
    assert.equal(parsed.event.actorId, null);
  }
});

test('AC3: provision username is org-scoped and deterministic by org-id-prefix', async () => {
  const { prisma } = makeFakePrisma();
  const svc = new BootstrapCredentialsService(prisma);
  const result = await svc.provision(ORG_ID);
  // The contract from bootstrap-credentials.service.ts: username =
  // `bootstrap-admin@${orgId.slice(0, 8)}`. Pinning prevents an
  // accidental change that breaks audit-correlation (audit_events.before
  // and after carry the username verbatim).
  assert.equal(result.username, `bootstrap-admin@${ORG_ID.slice(0, 8)}`);
});

// ── disable() ────────────────────────────────────────────────────────

test('AC3: disable() emits bootstrap_admin.disabled exactly once on transition', async () => {
  const existing = {
    id: CRED_ID,
    organizationId: ORG_ID,
    username: 'bootstrap-admin@aaaaaaaa',
    passwordHash: 'hash',
    disabledAt: null,
  };
  const { prisma, calls } = makeFakePrisma({ existingCredential: existing });
  const svc = new BootstrapCredentialsService(prisma);
  await svc.disable(ORG_ID, ADMIN_ID);

  assert.equal(calls.bootstrapCredentialFindUnique.length, 1);
  assert.equal(calls.bootstrapCredentialUpdateMany.length, 1);
  // Pin the conditional WHERE — without `disabledAt: null` in the
  // filter, two concurrent disable() calls would both succeed and
  // both emit audit events. This is the race-safety guarantee.
  assert.deepEqual(
    calls.bootstrapCredentialUpdateMany[0].where,
    { organizationId: ORG_ID, disabledAt: null },
    'updateMany must filter on disabledAt: null for race-safety',
  );
  assert.equal(calls.outboxCreate.length, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'bootstrap_admin.disabled');
  assert.equal(outbox.aggregateId, CRED_ID);
  assert.equal(outbox.payload.actorId, ADMIN_ID, 'OIDC admin who triggered retirement is the actor');
  assert.equal(outbox.payload.before.username, existing.username);
  assert.equal(outbox.payload.after, null);
});

test('AC3: disable() outbox payload validates against AuditEvent taxonomy', async () => {
  const existing = {
    id: CRED_ID,
    organizationId: ORG_ID,
    username: 'bootstrap-admin@aaaaaaaa',
    passwordHash: 'hash',
    disabledAt: null,
  };
  const { prisma, calls } = makeFakePrisma({ existingCredential: existing });
  const svc = new BootstrapCredentialsService(prisma);
  await svc.disable(ORG_ID, ADMIN_ID);
  const outbox = calls.outboxCreate[0].data;
  const candidate = {
    eventId: outbox.eventId,
    occurredAt: new Date().toISOString(),
    actorId: null,
    organizationId: outbox.organizationId,
    entityType: outbox.aggregateType,
    entityId: outbox.aggregateId,
    eventType: outbox.eventType,
    ...outbox.payload,
  };
  const parsed = safeParseAuditEvent(candidate);
  assert.equal(parsed.ok, true, `relay would reject: ${JSON.stringify(parsed)}`);
});

test('AC3: disable() is idempotent — no outbox emit on already-disabled row', async () => {
  // The OIDC callback path can re-call disable() if a future regression
  // forgets the .catch guard. Audit emission on EVERY call would pollute
  // the audit log with duplicate "disabled" events for one actual
  // transition. Pin the idempotent behavior at the unit level.
  const existing = {
    id: CRED_ID,
    organizationId: ORG_ID,
    username: 'bootstrap-admin@aaaaaaaa',
    passwordHash: 'hash',
    disabledAt: new Date('2026-05-21T10:00:00.000Z'),
  };
  const { prisma, calls } = makeFakePrisma({ existingCredential: existing });
  const svc = new BootstrapCredentialsService(prisma);
  await svc.disable(ORG_ID, ADMIN_ID);

  assert.equal(calls.bootstrapCredentialFindUnique.length, 1, 'must read state to detect no-op');
  // The conditional updateMany still runs but matches zero rows
  // (disabledAt !== null filters it out) — race-safety semantics.
  // No outbox emit because count === 0 path bails before the emit.
  assert.equal(calls.bootstrapCredentialUpdateMany.length, 1);
  assert.equal(calls.outboxCreate.length, 0, 'no audit emit when count===0 (no transition)');
});

test('AC3: disable() with no credential row is a no-op (no emit, no update)', async () => {
  // Edge case: an org with no bootstrap_credential row (e.g. legacy data
  // pre-Story 2-7). disable() must not throw, must not emit, must not
  // synthesize a row. The OIDC callback wraps disable() in .catch but
  // we still want the inner contract to be benign.
  const { prisma, calls } = makeFakePrisma({ existingCredential: null });
  const svc = new BootstrapCredentialsService(prisma);
  await svc.disable(ORG_ID, ADMIN_ID);

  assert.equal(calls.bootstrapCredentialFindUnique.length, 1);
  // Short-circuit on missing row — no updateMany call, no audit emit.
  assert.equal(calls.bootstrapCredentialUpdateMany.length, 0);
  assert.equal(calls.outboxCreate.length, 0);
});

test('AC3 race-safety: disable() must NOT emit if updateMany returns count=0', async () => {
  // Regression for the H1 finding from Story 6-4 adversarial review:
  // a naive read-modify-write (if (disabledAt === null) update()) lets
  // two concurrent callers both pass the in-memory guard and both emit
  // audit events. The conditional updateMany shifts the gate to the
  // DB layer — exactly one tx sees count === 1, the rest see count === 0
  // and bail before emit.
  //
  // We simulate the losing-tx by fabricating a fake where updateMany
  // returns count: 0 even though findUnique returns a fresh row (the
  // "we read it as non-disabled, but a concurrent tx flipped it before
  // our UPDATE landed" scenario). The service must NOT emit.
  const racedFake = (() => {
    const calls = { outboxCreate: [], updateMany: [] };
    const tx = {
      bootstrapCredential: {
        findUnique: async () => ({
          id: CRED_ID,
          username: 'bootstrap-admin@aaaaaaaa',
        }),
        updateMany: async (args) => {
          calls.updateMany.push(args);
          return { count: 0 }; // a concurrent tx beat us to the transition
        },
      },
      outboxEvent: {
        create: async (args) => {
          calls.outboxCreate.push(args);
          return args.data;
        },
      },
      $executeRaw: async () => 0,
    };
    return {
      prisma: { $transaction: async (fn) => await fn(tx) },
      calls,
    };
  })();
  const svc = new BootstrapCredentialsService(racedFake.prisma);
  await svc.disable(ORG_ID, ADMIN_ID);
  assert.equal(racedFake.calls.updateMany.length, 1);
  assert.equal(
    racedFake.calls.outboxCreate.length,
    0,
    'losing-tx race must NOT emit a duplicate bootstrap_admin.disabled audit event',
  );
});

test('AC3: disable() accepts null actor (legacy / runbook callers)', async () => {
  // The OIDC callback path always has user.id. But operator-runbook
  // scripts that call disable() directly may not have a tenant actor.
  // Pin that the contract accepts null without producing a malformed
  // outbox payload (actorId is nullable in the taxonomy).
  const existing = {
    id: CRED_ID,
    organizationId: ORG_ID,
    username: 'bootstrap-admin@aaaaaaaa',
    passwordHash: 'hash',
    disabledAt: null,
  };
  const { prisma, calls } = makeFakePrisma({ existingCredential: existing });
  const svc = new BootstrapCredentialsService(prisma);
  await svc.disable(ORG_ID, null);

  assert.equal(calls.outboxCreate.length, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.payload.actorId, null);
  // Validate against the taxonomy — null actor must round-trip.
  const candidate = {
    eventId: outbox.eventId,
    occurredAt: new Date().toISOString(),
    actorId: null,
    organizationId: outbox.organizationId,
    entityType: outbox.aggregateType,
    entityId: outbox.aggregateId,
    eventType: outbox.eventType,
    ...outbox.payload,
  };
  const parsed = safeParseAuditEvent(candidate);
  assert.equal(parsed.ok, true);
});
