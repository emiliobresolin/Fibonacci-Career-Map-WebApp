// Story 6-4 AC1 + AC2 + AC3: BootstrapService orchestrates the
// four-step first-admin flow.
//
// The orchestrator composes already-tested building blocks:
//   1. OrganizationsService.provision  (Story 6-1)
//   2. SeedingService.seedOrganization (Story 6-3)
//   3. BootstrapCredentialsService.provision (Story 2-7)
//   4. RecoveryCodesService.provisionBatch (Story 2-7)
//
// We stub the four collaborators rather than the underlying Prisma —
// each collaborator has its own unit-test surface that pins outbox
// emission, RLS scope, etc. Here we test the orchestration contract:
//   • all four are called in order with the right inputs
//   • returns { organization, credentials, recoveryCodes }
//   • surfaces credentials + 10 codes ONCE (plaintext)
//   • AC2: a slug collision aborts AT step 1 — no other writes happen
//   • AC2: an AlreadySeededError is translated to 409 Conflict

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { BootstrapService } = await import('../dist/organizations/bootstrap.service.js');
const { AlreadySeededError } = await import('../dist/seeding/seeding.service.js');

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const FAKE_ORG = {
  id: ORG_ID,
  slug: 'acme',
  name: 'Acme Corp',
  visibilityDefault: 'OWN_ONLY',
  approvalWorkflowDefault: 'SINGLE',
  promotionMode: 'CALIBRATION',
  createdAt: '2026-05-22T10:00:00.000Z',
};

function makeStubs({ provisionThrows = null, seedThrows = null } = {}) {
  const calls = { provision: [], seed: [], creds: [], recovery: [] };
  const organizations = {
    provision: async (input) => {
      calls.provision.push(input);
      if (provisionThrows) throw provisionThrows;
      return FAKE_ORG;
    },
  };
  const seeding = {
    seedOrganization: async (orgId) => {
      calls.seed.push(orgId);
      if (seedThrows) throw seedThrows;
      return { organizationId: orgId, counts: {}, orgDefaults: {} };
    },
  };
  const bootstrapCredentials = {
    provision: async (orgId) => {
      calls.creds.push(orgId);
      return {
        username: `bootstrap-admin@${orgId.slice(0, 8)}`,
        password: 'fake-strong-password-32-hex-chars',
        userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      };
    },
  };
  const recovery = {
    provisionBatch: async (orgId) => {
      calls.recovery.push(orgId);
      return Array.from({ length: 10 }, (_, i) => `code-${i}`);
    },
  };
  return { organizations, seeding, bootstrapCredentials, recovery, calls };
}

// ── AC1: happy path ─────────────────────────────────────────────────

test('AC1: bootstrap composes provision → seed → admin → recovery and returns all artifacts', async () => {
  const { organizations, seeding, bootstrapCredentials, recovery, calls } = makeStubs();
  const svc = new BootstrapService(organizations, seeding, bootstrapCredentials, recovery);
  const result = await svc.bootstrap({ slug: 'acme', name: 'Acme Corp' });

  assert.equal(calls.provision.length, 1);
  assert.deepEqual(calls.provision[0], { slug: 'acme', name: 'Acme Corp' });
  assert.equal(calls.seed.length, 1);
  assert.equal(calls.seed[0], ORG_ID);
  assert.equal(calls.creds.length, 1);
  assert.equal(calls.creds[0], ORG_ID);
  assert.equal(calls.recovery.length, 1);
  assert.equal(calls.recovery[0], ORG_ID);

  assert.equal(result.organization.id, ORG_ID);
  assert.equal(result.organization.slug, 'acme');
  assert.equal(result.credentials.username, `bootstrap-admin@${ORG_ID.slice(0, 8)}`);
  assert.equal(typeof result.credentials.password, 'string');
  assert.ok(result.credentials.password.length > 0);
  assert.equal(result.credentials.userId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(result.recoveryCodes.length, 10);
});

// ── AC2: refuses to recreate ────────────────────────────────────────

test('AC2: slug collision aborts at step 1 — no seed / admin / recovery writes', async () => {
  // OrganizationsService.provision throws ConflictException on slug
  // collision. The orchestrator must propagate WITHOUT calling any of
  // the downstream steps. This is the "refuses to recreate" guarantee.
  const { ConflictException } = await import('@nestjs/common');
  const conflict = new ConflictException({ error: 'conflict', message: 'already exists' });
  const { organizations, seeding, bootstrapCredentials, recovery, calls } = makeStubs({
    provisionThrows: conflict,
  });
  const svc = new BootstrapService(organizations, seeding, bootstrapCredentials, recovery);
  let threw = false;
  try {
    await svc.bootstrap({ slug: 'acme', name: 'Acme Corp' });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409, 'slug collision must surface as 409');
  }
  assert.ok(threw, 'expected throw on slug collision');
  assert.equal(calls.seed.length, 0, 'seed must not run when provision failed');
  assert.equal(calls.creds.length, 0, 'credentials must not run when provision failed');
  assert.equal(calls.recovery.length, 0, 'recovery codes must not run when provision failed');
});

test('AC2: AlreadySeededError translates to 409 (defensive — should not reach in practice)', async () => {
  // Seeding cannot fail with AlreadySeededError on a newly-provisioned
  // org (no career_tracks rows exist). But if a future refactor folds
  // bootstrap into an "upgrade existing org" path, the translation
  // protects callers from a leaked domain error.
  const seedErr = new AlreadySeededError(ORG_ID);
  const { organizations, seeding, bootstrapCredentials, recovery, calls } = makeStubs({
    seedThrows: seedErr,
  });
  const svc = new BootstrapService(organizations, seeding, bootstrapCredentials, recovery);
  let threw = false;
  try {
    await svc.bootstrap({ slug: 'acme', name: 'Acme Corp' });
  } catch (err) {
    threw = true;
    assert.equal(err.getStatus(), 409);
    assert.match(err.message ?? '', /already bootstrapped/i);
  }
  assert.ok(threw);
  // Provision succeeded; seed failed; subsequent steps did NOT run.
  assert.equal(calls.provision.length, 1);
  assert.equal(calls.creds.length, 0);
  assert.equal(calls.recovery.length, 0);
});

test('non-AlreadySeededError from seeding propagates as-is (not silently turned into 409)', async () => {
  // Catch-arm specificity: a transient DB error must NOT be misreported
  // as a 409. The runbook would point operators at "duplicate org slug"
  // for what's actually a transient infra failure.
  const transient = new Error('connection terminated');
  const { organizations, seeding, bootstrapCredentials, recovery, calls } = makeStubs({
    seedThrows: transient,
  });
  const svc = new BootstrapService(organizations, seeding, bootstrapCredentials, recovery);
  let threw = false;
  try {
    await svc.bootstrap({ slug: 'acme', name: 'Acme Corp' });
  } catch (err) {
    threw = true;
    assert.equal(err.message, 'connection terminated', 'transient error must propagate raw');
    assert.equal(err.getStatus?.(), undefined, 'must NOT wrap as HttpException');
  }
  assert.ok(threw);
  assert.equal(calls.creds.length, 0);
});

// ── Ordering invariant ──────────────────────────────────────────────

test('orchestration order: provision precedes seed precedes admin precedes recovery', async () => {
  // The order matters because each step depends on the previous:
  //   • seed needs org.id from provision
  //   • admin needs an existing org row for FK
  //   • recovery needs an existing org row for FK
  // Capture timestamps so a refactor that parallelizes the calls
  // (which would lose the dependency chain) trips the assertion.
  const timeline = [];
  const stamp = (label) => {
    timeline.push({ label, t: performance.now() });
  };
  const organizations = {
    provision: async () => {
      stamp('provision');
      // Tiny await so the next step's stamp is strictly later.
      await new Promise((r) => setImmediate(r));
      return FAKE_ORG;
    },
  };
  const seeding = {
    seedOrganization: async () => {
      stamp('seed');
      await new Promise((r) => setImmediate(r));
      return { organizationId: ORG_ID, counts: {}, orgDefaults: {} };
    },
  };
  const bootstrapCredentials = {
    provision: async () => {
      stamp('admin');
      await new Promise((r) => setImmediate(r));
      return { username: 'u', password: 'p', userId: 'b' };
    },
  };
  const recovery = {
    provisionBatch: async () => {
      stamp('recovery');
      return Array.from({ length: 10 }, (_, i) => `c${i}`);
    },
  };
  const svc = new BootstrapService(organizations, seeding, bootstrapCredentials, recovery);
  await svc.bootstrap({ slug: 'acme', name: 'Acme Corp' });
  assert.deepEqual(
    timeline.map((e) => e.label),
    ['provision', 'seed', 'admin', 'recovery'],
    'orchestration order must be strict — each step depends on the previous',
  );
});
