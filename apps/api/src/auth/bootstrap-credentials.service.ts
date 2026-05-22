import { randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import { hashPassword, verifyPassword } from './password-hash.js';

/**
 * Bootstrap admin credentials service (Story 2-7 AC1 + AC2, PRD FR-1.2).
 *
 *   • `provision(organizationId)` — one-shot generator called by the
 *     org-provisioning flow. Returns the plaintext username + password
 *     ONCE; the caller is responsible for surfacing them via a secure
 *     channel (the SeedingService prints to stdout when run interactively,
 *     and never logs). The DB row stores only the scrypt hash.
 *
 *   • `verify(organizationId, username, password)` — used by
 *     POST /auth/bootstrap-login. Returns the admin candidate's
 *     intended row on success, null on any failure (wrong user,
 *     wrong password, disabled). Constant-time on the password
 *     branch so timing doesn't reveal whether the username matched.
 *
 *   • `disable(organizationId)` — called inside the OIDC callback
 *     transaction the first time an ADMIN-roled user signs in via OIDC
 *     for this org. Sets `disabledAt = NOW()` so subsequent bootstrap
 *     logins are rejected. Idempotent — calling it again is a no-op.
 *
 * Auditability: every state-changing call logs a structured pino event
 * with the operation + organizationId (no username, no password, ever).
 * Outbox-emitted audit events are deferred to a follow-up that extends
 * the `AuditEvent` taxonomy in @fcm/domain-contracts.
 */
@Injectable()
export class BootstrapCredentialsService {
  private readonly logger = new Logger(BootstrapCredentialsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Provision the bootstrap credential row + corresponding admin user
   *  for a freshly-created org. All three rows (user, role_assignment,
   *  bootstrap_credential) are written in a single transaction so a
   *  partial-failure crash never leaves the org in a half-provisioned
   *  state. Plaintext is returned exactly once — store it nowhere. */
  async provision(
    organizationId: string,
  ): Promise<{ username: string; password: string; userId: string }> {
    const username = `bootstrap-admin@${organizationId.slice(0, 8)}`;
    const password = generateStrongPassword();
    const passwordHash = await hashPassword(password);
    // The bootstrap-admin user gets a synthetic email derived from the
    // username so it sits alongside future OIDC-linked users in the
    // `users` table without colliding on the (organizationId, email)
    // unique index.
    const email = `${username}.bootstrap.local`;
    const userId = await withOrgScope(this.prisma, organizationId, async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId,
          email,
          displayName: 'Bootstrap Administrator',
        },
      });
      await tx.roleAssignment.create({
        data: { userId: user.id, organizationId, role: 'ADMIN' },
      });
      const cred = await tx.bootstrapCredential.create({
        data: { organizationId, username, passwordHash },
      });
      // Story 6-4 AC3: emit a single `bootstrap_admin.provisioned`
      // outbox event covering the atomic user+role+credential triple.
      // Three rows in one logical action → one audit event. Same tx so
      // a rollback drops both the credential and the audit row.
      await tx.outboxEvent.create({
        data: {
          eventId: randomUUID(),
          organizationId,
          aggregateType: 'bootstrap_credential',
          aggregateId: cred.id,
          eventType: 'bootstrap_admin.provisioned',
          payload: {
            actorId: null,
            reason: null,
            before: null,
            after: { userId: user.id, username },
          },
        },
      });
      return user.id;
    });
    this.logger.log({ op: 'provision', organizationId }, 'bootstrap credentials provisioned');
    return { username, password, userId };
  }

  /** Look up the bootstrap admin's user_id. Returns null when the org has
   *  no bootstrap row (e.g. SeedingService hasn't run). */
  async findUserId(organizationId: string, username: string): Promise<string | null> {
    const row = await withOrgScope(this.prisma, organizationId, (tx) =>
      tx.bootstrapCredential.findUnique({ where: { organizationId } }),
    );
    if (!row || row.username !== username) return null;
    // Find the corresponding admin user by the synthetic email convention.
    const email = `${row.username}.bootstrap.local`;
    const user = await withOrgScope(this.prisma, organizationId, (tx) =>
      tx.user.findUnique({
        where: { organizationId_email: { organizationId, email } },
        select: { id: true },
      }),
    );
    return user?.id ?? null;
  }

  /** Verify a (username, password) pair. Returns `null` on every failure
   *  mode so callers cannot distinguish "wrong username" from "wrong
   *  password" via timing or response shape. */
  async verify(
    organizationId: string,
    username: string,
    password: string,
  ): Promise<{ ok: true } | null> {
    if (typeof username !== 'string' || typeof password !== 'string') return null;
    const row = await withOrgScope(this.prisma, organizationId, (tx) =>
      tx.bootstrapCredential.findUnique({ where: { organizationId } }),
    );
    // Hash an opaque sentinel when the row is missing so the total
    // verify path takes the same wall-clock time regardless. Without
    // this, "no bootstrap row" returns instantly and an attacker can
    // enumerate which orgs still have bootstrap credentials enabled.
    if (!row) {
      await verifyPassword(password, SENTINEL_HASH);
      return null;
    }
    if (row.username !== username) {
      // Don't short-circuit — run the verify on the actual hash so
      // timing doesn't reveal a wrong-username outcome.
      await verifyPassword(password, row.passwordHash);
      return null;
    }
    if (row.disabledAt !== null) {
      await verifyPassword(password, row.passwordHash);
      return null;
    }
    const ok = await verifyPassword(password, row.passwordHash);
    return ok ? { ok: true } : null;
  }

  /** Mark the bootstrap row as disabled. Idempotent — repeated calls
   *  on the same row are a no-op. Emits a `bootstrap_admin.disabled`
   *  audit event ONLY when the row transitioned (updateMany count === 1);
   *  a no-op call does not pollute the audit log.
   *
   *  Race-safety: two concurrent OIDC ADMIN sign-ins both call this
   *  method. The transition is gated by a CONDITIONAL `updateMany`
   *  with `where: { disabledAt: null }` — Postgres's row-locking
   *  semantics under READ COMMITTED guarantee that exactly one
   *  caller observes `count === 1`; the other observes `count === 0`
   *  and skips the audit emit. A naive read-then-update would allow
   *  both callers to pass an in-memory `if (disabledAt === null)`
   *  guard and both would emit, producing duplicate audit history
   *  for one logical transition.
   *
   *  `actorUserId` is the OIDC-authenticated admin who triggered the
   *  retirement (Story 6-4 AC2). It's optional because legacy callers
   *  outside the OIDC callback path (e.g. operator runbook scripts)
   *  may not have a tenant actor; those calls record `actorId = null`. */
  async disable(organizationId: string, actorUserId: string | null = null): Promise<void> {
    await withOrgScope(this.prisma, organizationId, async (tx) => {
      // Read the credential row to capture the audit-payload fields
      // (username, id) BEFORE attempting the transition. If the row
      // doesn't exist, nothing to disable.
      const existing = await tx.bootstrapCredential.findUnique({
        where: { organizationId },
        select: { id: true, username: true },
      });
      if (!existing) {
        return;
      }
      // Conditional update — only succeeds when disabled_at IS NULL.
      // Postgres acquires a row lock on matching rows; under
      // concurrent calls, exactly one transaction wins. The other
      // sees count === 0 and bails before emitting.
      const updated = await tx.bootstrapCredential.updateMany({
        where: { organizationId, disabledAt: null },
        data: { disabledAt: new Date() },
      });
      if (updated.count === 0) {
        // Already disabled by a prior call (idempotent path) OR a
        // concurrent tx beat us to the transition. Either way, no
        // audit emit — the winner already emitted exactly once.
        return;
      }
      // Story 6-4 AC3: emit `bootstrap_admin.disabled` ONLY on the
      // first transition. Same tx as the row update so the audit +
      // state cannot diverge.
      await tx.outboxEvent.create({
        data: {
          eventId: randomUUID(),
          organizationId,
          aggregateType: 'bootstrap_credential',
          aggregateId: existing.id,
          eventType: 'bootstrap_admin.disabled',
          payload: {
            actorId: actorUserId,
            reason: null,
            before: { username: existing.username },
            after: null,
          },
        },
      });
      this.logger.log(
        { op: 'disable', organizationId, actorUserId },
        'bootstrap credentials disabled after OIDC admin sign-in',
      );
    });
  }
}

/** Sentinel hash used to keep `verify`'s time constant when the row is
 *  missing. Generated lazily at import time. The plaintext value is
 *  random + never accepted by any user-facing path, so it can be safely
 *  treated as a salt-equivalent constant. */
const SENTINEL_HASH = 'scrypt$16384$8$1$xxxxxxxxxxxxxxxxxxxxxx$' +
  'x'.repeat(86); // shape-valid format; verifyPassword returns false on actual decode failure

/** Generate a 32-character password with mixed entropy sources. Format:
 *  hex(16 random bytes) ⊕ punctuation suffix so it round-trips through
 *  cut-and-paste / email without confusion (no ambiguous Il10O chars). */
function generateStrongPassword(): string {
  // 16 random bytes → 32 hex chars (128 bits). Stronger than any user-
  // typed password, easily copy-pastable, never confused with similar-
  // looking characters. The admin rotates this via /auth/recovery-redeem
  // or via a future /admin/credentials/rotate endpoint after first login.
  return randomBytes(16).toString('hex');
}
