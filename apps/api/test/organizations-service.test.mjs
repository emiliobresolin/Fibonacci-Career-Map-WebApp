// Story 6-1 AC1 + AC3 + AC4: OrganizationsService.provision().
//
// Asserts:
//   AC1 — created org carries the PRD-mandated defaults
//         (visibility_default = OWN_ONLY, approval_workflow_default = SINGLE,
//          promotion_mode = CALIBRATION) when the caller omits them.
//   AC3 — a successful provision emits exactly one outbox row with
//         eventType = 'organization.created' AND the payload validates
//         against the AuditEvent taxonomy (so the relay won't DLQ it).
//   AC4 — defaults match the schema's `@default` markers — the service
//         doesn't override or strip them.
//
// We use a capturing fake of PrismaService so the test runs without a
// live DB. The fake faithfully implements the contract OrganizationsService
// depends on: $transaction(fn) wraps a tx with `organization.create` and
// `outboxEvent.create`, and the org-create select returns the row shape
// the service then echoes back. The faithfulness matters — a fake that
// returns hardcoded defaults regardless of the schema's @default would
// pass even after a future regression that removed the schema markers.
// We therefore also pin the assertion that the SERVICE does not pass
// `visibility_default` etc. into the create() call — defaults flow from
// Prisma/Postgres, not from the service.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { OrganizationsService } = await import('../dist/organizations/organizations.service.js');
const { safeParseAuditEvent } = await import('@fcm/domain-contracts');

const ORG_ID = '99999999-9999-4999-8999-999999999999';

function makeCapturingPrisma({ organizationCreate = null, throwOrgCreate = null } = {}) {
  const calls = { orgCreate: [], outboxCreate: [], commits: 0 };
  const tx = {
    organization: {
      create: async (args) => {
        calls.orgCreate.push(args);
        if (throwOrgCreate) throw throwOrgCreate;
        // Default-return shape mirrors what Prisma returns for the
        // service's `select` — the new-row fields including the
        // schema-default @default markers materialized as their
        // declared values. A future regression that removes one of
        // these `@default(...)` clauses MUST be caught by an
        // integration test (real DB); this unit test only proves
        // the service propagates them faithfully.
        return (
          organizationCreate ?? {
            id: ORG_ID,
            slug: args.data.slug,
            name: args.data.name,
            visibilityDefault: 'OWN_ONLY',
            approvalWorkflowDefault: 'SINGLE',
            promotionMode: 'CALIBRATION',
            createdAt: new Date('2026-05-22T10:00:00.000Z'),
          }
        );
      },
    },
    outboxEvent: {
      create: async (args) => {
        calls.outboxCreate.push(args);
        return args.data;
      },
    },
  };
  const prisma = {
    $transaction: async (fn) => {
      const out = await fn(tx);
      calls.commits += 1;
      return out;
    },
  };
  return { prisma, calls };
}

// ── AC1 + AC4: defaults ─────────────────────────────────────────────

test('AC1+AC4: provision creates org with PRD-mandated defaults', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new OrganizationsService(prisma);
  const result = await svc.provision({ slug: 'acme', name: 'Acme Corp' });

  assert.equal(result.slug, 'acme');
  assert.equal(result.name, 'Acme Corp');
  assert.equal(result.visibilityDefault, 'OWN_ONLY', 'PRD §14.2: new org default visibility');
  assert.equal(result.approvalWorkflowDefault, 'SINGLE', 'PRD §8.7: new org default approval workflow');
  assert.equal(result.promotionMode, 'CALIBRATION', 'PRD §14.8: new org starts in CALIBRATION');

  // Pin: the SERVICE does not override defaults. Defaults must come
  // from the Prisma schema's @default markers + DB column defaults.
  assert.equal(calls.orgCreate.length, 1);
  const createArgs = calls.orgCreate[0];
  assert.ok(
    !('visibilityDefault' in createArgs.data),
    'service must not pass visibilityDefault — schema @default carries it',
  );
  assert.ok(
    !('approvalWorkflowDefault' in createArgs.data),
    'service must not pass approvalWorkflowDefault — schema @default carries it',
  );
  assert.ok(
    !('promotionMode' in createArgs.data),
    'service must not pass promotionMode — schema @default carries it',
  );
});

// ── AC3: outbox emission + payload validates against the audit taxonomy

test('AC3: provision emits an organization.created outbox row in the same transaction', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new OrganizationsService(prisma);
  await svc.provision({ slug: 'acme', name: 'Acme Corp' });

  assert.equal(calls.commits, 1, 'org + outbox must commit in one transaction');
  assert.equal(calls.outboxCreate.length, 1);
  const outbox = calls.outboxCreate[0].data;
  assert.equal(outbox.eventType, 'organization.created');
  assert.equal(outbox.aggregateType, 'organization');
  assert.equal(outbox.aggregateId, ORG_ID);
  assert.equal(outbox.organizationId, ORG_ID);
});

test('AC3: outbox payload validates against AuditEvent taxonomy (relay would accept it)', async () => {
  const { prisma, calls } = makeCapturingPrisma();
  const svc = new OrganizationsService(prisma);
  await svc.provision({ slug: 'acme', name: 'Acme Corp' });
  const outbox = calls.outboxCreate[0].data;
  // The relay (Story 3-3) merges the outbox row's structural columns
  // with the payload into a candidate it parses. Reconstruct that
  // candidate here so we exercise the same shape the relay sees —
  // not just the payload in isolation.
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
  assert.equal(parsed.ok, true, `relay would reject the outbox row: ${JSON.stringify(parsed)}`);
  if (parsed.ok) {
    assert.equal(parsed.event.eventType, 'organization.created');
    assert.equal(parsed.event.actorId, null, 'bootstrap-tooling provisioning is a system event');
    assert.equal(parsed.event.after.slug, 'acme');
    assert.equal(parsed.event.after.visibilityDefault, 'OWN_ONLY');
    assert.equal(parsed.event.after.approvalWorkflowDefault, 'SINGLE');
    assert.equal(parsed.event.after.promotionMode, 'CALIBRATION');
  }
});

// ── Validation ─────────────────────────────────────────────────────

test('rejects invalid slug shapes (capitals, leading hyphen, too short)', async () => {
  const svc = new OrganizationsService(makeCapturingPrisma().prisma);
  for (const bad of ['A', '-acme', 'acme-', 'AC ME', '!nope', '', 'a']) {
    let threw = false;
    try {
      await svc.provision({ slug: bad, name: 'Acme' });
    } catch (err) {
      threw = true;
      assert.equal(err.getStatus(), 400, `bad slug "${bad}" should be 400`);
    }
    assert.ok(threw, `slug "${bad}" should have been rejected`);
  }
});

test('rejects empty name and over-long name', async () => {
  const svc = new OrganizationsService(makeCapturingPrisma().prisma);
  let threwEmpty = false;
  try {
    await svc.provision({ slug: 'acme', name: '   ' });
  } catch (err) {
    threwEmpty = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threwEmpty);

  let threwLong = false;
  try {
    await svc.provision({ slug: 'acme', name: 'x'.repeat(201) });
  } catch (err) {
    threwLong = true;
    assert.equal(err.getStatus(), 400);
  }
  assert.ok(threwLong);
});

test('slug collision (P2002) surfaces as 409 ConflictException', async () => {
  // Faithfully model Prisma's known-request-error shape so the catch
  // arm is exercised exactly the way it would in production.
  const { Prisma } = await import('@prisma/client');
  const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['slug'] },
  });
  const { prisma } = makeCapturingPrisma({ throwOrgCreate: p2002 });
  const svc = new OrganizationsService(prisma);
  let threw = false;
  try {
    await svc.provision({ slug: 'acme', name: 'Acme Corp' });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409, 'slug collision must surface as 409');
    assert.match(err.message ?? '', /already exists/i);
  }
  assert.ok(threw);
});

test('transactional atomicity: outbox failure rolls back org create', async () => {
  // Model the failure shape: outbox.create throws → $transaction
  // surfaces the error → org row never persists in real Postgres.
  // Our fake's $transaction doesn't simulate rollback (it's a fake),
  // but we CAN assert that the error surfaces and the service does
  // not return a half-successful result.
  const calls = { orgCreate: 0, outboxCreate: 0 };
  const prisma = {
    $transaction: async (fn) => {
      const tx = {
        organization: {
          create: async (args) => {
            calls.orgCreate += 1;
            return {
              id: ORG_ID,
              slug: args.data.slug,
              name: args.data.name,
              visibilityDefault: 'OWN_ONLY',
              approvalWorkflowDefault: 'SINGLE',
              promotionMode: 'CALIBRATION',
              createdAt: new Date(),
            };
          },
        },
        outboxEvent: {
          create: async () => {
            calls.outboxCreate += 1;
            throw new Error('simulated outbox failure');
          },
        },
      };
      // Real $transaction surfaces the throw to the caller.
      return await fn(tx);
    },
  };
  const svc = new OrganizationsService(prisma);
  let threw = false;
  try {
    await svc.provision({ slug: 'acme', name: 'Acme Corp' });
  } catch (err) {
    threw = true;
    assert.match(err.message ?? '', /simulated outbox failure/);
  }
  assert.ok(threw, 'outbox emit failure must propagate, not swallow');
  // Pin: the service called both inside the SAME transaction. Real PG
  // would roll back the org create alongside the outbox failure.
  assert.equal(calls.orgCreate, 1);
  assert.equal(calls.outboxCreate, 1);
});
