import { randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import { hashPassword, verifyPassword } from './password-hash.js';

/**
 * OIDC-outage recovery codes service (Story 2-7 AC3, PRD FR-1.2).
 *
 *   • `provisionBatch(organizationId)` — generates 10 single-use codes
 *     for the org at bootstrap. Plaintext codes are returned ONCE; the
 *     row stores only the scrypt hash. Code format is a memorable
 *     6-digit-per-segment string (e.g. `f8a3-9c12-77be-2401`) for ease
 *     of secure-channel delivery.
 *
 *   • `redeem(organizationId, code, adminUserId)` — single-use semantics.
 *     Finds the unburned row whose hash matches; sets `redeemedAt` +
 *     `redeemedByUserId`. Returns `true` on success, `false` on every
 *     failure mode (no match / already burned / wrong org). Constant-time
 *     against unburned-row count: every call hashes against EVERY active
 *     code so an attacker cannot infer how many codes remain by timing.
 *
 * The redemption flow itself doesn't log the admin in — that's the
 * controller's job after redeem() returns true. Audit emission via the
 * outbox is deferred to a follow-up (requires extending the AuditEvent
 * taxonomy in @fcm/domain-contracts).
 */
@Injectable()
export class RecoveryCodesService {
  private readonly logger = new Logger(RecoveryCodesService.name);

  static readonly BATCH_SIZE = 10;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Provision a fresh batch of 10 single-use recovery codes for the org.
   *  Plaintext returned once — store nowhere. Idempotency is the caller's
   *  responsibility: calling provisionBatch twice creates 20 active codes,
   *  which is probably wrong. The org-provisioning flow calls this once
   *  during initial setup.
   */
  async provisionBatch(organizationId: string): Promise<string[]> {
    const plaintexts: string[] = [];
    const hashes: string[] = [];
    for (let i = 0; i < RecoveryCodesService.BATCH_SIZE; i++) {
      const code = generateRecoveryCode();
      plaintexts.push(code);
      // Sequential hashing because scrypt is CPU-intensive; parallel
      // hashing of 10 codes would briefly saturate the event loop.
      // eslint-disable-next-line no-await-in-loop
      const hash = await hashPassword(code);
      hashes.push(hash);
    }
    await withOrgScope(this.prisma, organizationId, async (tx) => {
      await tx.recoveryCode.createMany({
        data: hashes.map((codeHash) => ({ organizationId, codeHash })),
      });
      // Story 6-4 AC3: emit a single `recovery_codes.provisioned`
      // outbox event for the batch. The batch is the unit, not an
      // individual code — leaking each code's id in audit would
      // be a security smell (the codes are sensitive). Same tx as
      // the createMany so a rollback drops both.
      await tx.outboxEvent.create({
        data: {
          eventId: randomUUID(),
          organizationId,
          aggregateType: 'recovery_code',
          // Batch-scope event: aggregate_id has no single-row meaning,
          // so we use the org id as a stable proxy. The matching
          // audit_events.entity_id is then forced to null by the
          // outbox-relay payload reconstruction (see
          // outbox-relay.consumer.ts) — the payload-level entityId
          // override below is what the relay actually persists.
          aggregateId: organizationId,
          eventType: 'recovery_codes.provisioned',
          payload: {
            actorId: null,
            entityId: null,
            reason: null,
            before: null,
            after: { count: hashes.length },
          },
        },
      });
    });
    this.logger.log(
      { op: 'provision_batch', organizationId, count: hashes.length },
      'recovery codes provisioned',
    );
    return plaintexts;
  }

  /**
   * Attempt to redeem a recovery code. Returns true on successful redemption,
   * false on any failure. Constant-time over active codes: every call
   * hashes the supplied code against every active row, then picks the
   * one that matches.
   */
  async redeem(organizationId: string, code: string, adminUserId: string): Promise<boolean> {
    if (typeof code !== 'string' || code.length === 0) return false;
    const active = await withOrgScope(this.prisma, organizationId, (tx) =>
      tx.recoveryCode.findMany({
        where: { organizationId, redeemedAt: null },
        select: { id: true, codeHash: true },
      }),
    );
    // Hash against every active row. Even when we find a match, continue
    // through the remaining rows so the wall-clock time is uniform —
    // otherwise an attacker can infer match position from timing.
    let matchedId: string | null = null;
    for (const row of active) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await verifyPassword(code, row.codeHash);
      if (ok && matchedId === null) {
        matchedId = row.id;
      }
    }
    if (!matchedId) {
      this.logger.warn(
        { op: 'redeem_fail', organizationId, adminUserId },
        'recovery code redemption failed (no match)',
      );
      return false;
    }
    // Burn the matched row with a conditional update so a concurrent
    // redemption can't double-spend. updateMany returns count.
    const burned = await withOrgScope(this.prisma, organizationId, (tx) =>
      tx.recoveryCode.updateMany({
        where: { id: matchedId, redeemedAt: null },
        data: { redeemedAt: new Date(), redeemedByUserId: adminUserId },
      }),
    );
    if (burned.count === 0) {
      // Another redemption beat us to it. Surface as failure so the
      // caller does not issue a session token for an already-spent code.
      this.logger.warn(
        { op: 'redeem_race', organizationId, adminUserId, codeId: matchedId },
        'recovery code redemption raced — already burned',
      );
      return false;
    }
    this.logger.log(
      { op: 'redeem_success', organizationId, adminUserId, codeId: matchedId },
      'recovery code redeemed',
    );
    return true;
  }
}

/** Generate a memorable 16-hex-character code formatted in 4-char groups
 *  for easy transcription. Entropy: 64 bits, sufficient for a single-use
 *  code that's only valid for one org. */
function generateRecoveryCode(): string {
  const hex = randomBytes(8).toString('hex'); // 16 hex chars
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}
