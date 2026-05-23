import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import type { ActorContext } from '../auth/actor-context.js';

/**
 * Emit one `evidence.submitted` outbox event (Story 8-2, Arch §9.1 step
 * 4 — "Domain event: EvidenceSubmitted → notification to manager").
 *
 * Payload shape matches `EvidenceSubmittedSchema` in
 * `@fcm/domain-contracts/events/audit`:
 *   • `before: null` (creation event has no pre-state)
 *   • `after: { evidenceId, requirementId, employeeId }`
 *   • `reason: null` (PRD §10.1 does not require a reason for submission)
 *
 * Called from {@link EvidenceFinalizeService.finalize} INSIDE the
 * `withOrgScope` transaction that does the DRAFT → PENDING_APPROVAL
 * state flip. Co-committing the outbox row keeps audit + state from
 * diverging under failure (same outbox-pattern guarantee Epic 3 ships).
 *
 * Future stories will add `emitEvidenceApproved` / `emitEvidenceRejected`
 * / `emitEvidenceExpired` here once those state transitions land
 * (Stories 8-4 / 8-6 / 8-7). Keeping the evidence-audit helpers in
 * `apps/api/src/evidence/audit.ts` mirrors the configuration-module's
 * `apps/api/src/configuration/audit.ts` pattern.
 */
export async function emitEvidenceSubmitted(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actor: ActorContext,
  params: {
    evidenceId: string;
    requirementId: string;
    employeeId: string;
  },
): Promise<void> {
  const payload: Prisma.InputJsonValue = {
    actorId: actor.user_id,
    reason: null,
    before: null,
    after: {
      evidenceId: params.evidenceId,
      requirementId: params.requirementId,
      employeeId: params.employeeId,
    },
  };
  await tx.outboxEvent.create({
    data: {
      eventId: randomUUID(),
      organizationId,
      aggregateType: 'evidence',
      aggregateId: params.evidenceId,
      eventType: 'evidence.submitted',
      payload,
    },
  });
}
