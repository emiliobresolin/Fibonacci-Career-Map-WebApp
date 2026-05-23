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
/**
 * Emit one `evidence.retrieved` outbox event (Story 8-3 AC4).
 *
 * Payload shape matches `EvidenceRetrievedSchema` in
 * `@fcm/domain-contracts/events/audit`:
 *   • `before: { evidenceId, employeeId, requirementId }` — context
 *     about the row that was looked at; we mirror the
 *     `session.revoked` pattern by carrying read-side context in
 *     `before` and leaving `after` null since there's no state flip.
 *   • `reason: null` — read events don't carry a reason.
 *
 * Called by {@link EvidenceDownloadService.createDownloadUrl} INSIDE
 * `withOrgScope`, so the row's RLS predicate sees the right tenant.
 * The retrieval emits one audit row per presigned-URL issuance, not
 * per byte-level GET — a leaked URL re-fetched within its 10-min TTL
 * leaves no extra audit footprint.
 */
export async function emitEvidenceRetrieved(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actor: ActorContext,
  params: {
    evidenceId: string;
    employeeId: string;
    requirementId: string;
  },
): Promise<{ eventId: string }> {
  const eventId = randomUUID();
  const payload: Prisma.InputJsonValue = {
    actorId: actor.user_id,
    reason: null,
    before: {
      evidenceId: params.evidenceId,
      employeeId: params.employeeId,
      requirementId: params.requirementId,
    },
    after: null,
  };
  await tx.outboxEvent.create({
    data: {
      eventId,
      organizationId,
      aggregateType: 'evidence',
      aggregateId: params.evidenceId,
      eventType: 'evidence.retrieved',
      payload,
    },
  });
  return { eventId };
}

/**
 * Emit one `evidence.approved` outbox event (Story 8-4 AC5).
 *
 * Schema (EvidenceApprovedSchema in @fcm/domain-contracts):
 *   reason: z.string().min(1)   — PRD §10.1 requires a reason
 *   before: { evidenceId, employeeId, beforeScore }
 *   after:  { afterScore }
 *
 * `beforeScore` / `afterScore` carry 0 placeholders for Epic 8 — real
 * scoring lands in Epic 9 (the bulk-recalc consumer picks up the
 * audit row via `originatingEventId` and produces a real
 * `score.recalculated` snapshot delta). Emitting 0s today keeps the
 * audit-event taxonomy stable; Epic 9 will tighten the values.
 */
export async function emitEvidenceApproved(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actor: ActorContext,
  params: {
    evidenceId: string;
    employeeId: string;
    reason: string;
  },
): Promise<{ eventId: string }> {
  const eventId = randomUUID();
  const payload: Prisma.InputJsonValue = {
    actorId: actor.user_id,
    reason: params.reason,
    before: {
      evidenceId: params.evidenceId,
      employeeId: params.employeeId,
      // Epic-9 will replace these with real values from the
      // pre-mutation score snapshot. Story 8-4 ships placeholders.
      beforeScore: 0,
    },
    after: {
      afterScore: 0,
      // Story 8-5 AC2: capture the actor's role so HR investigations
      // can distinguish MANAGER from ADMIN-override approvals. MUST
      // live INSIDE `after` because the outbox-relay only persists
      // `before` / `after` JSONB to audit_events — a top-level field
      // would be validated and then dropped at the relay boundary.
      actorRole: actor.role,
    },
  };
  await tx.outboxEvent.create({
    data: {
      eventId,
      organizationId,
      aggregateType: 'evidence',
      aggregateId: params.evidenceId,
      eventType: 'evidence.approved',
      payload,
    },
  });
  return { eventId };
}

/**
 * Emit one `evidence.rejected` outbox event (Story 8-4 AC5).
 *
 * Schema (EvidenceRejectedSchema):
 *   reason: z.string().min(1)   — PRD §10.1 requires a reason
 *   before: null
 *   after: { evidenceId, employeeId }
 */
export async function emitEvidenceRejected(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actor: ActorContext,
  params: {
    evidenceId: string;
    employeeId: string;
    reason: string;
  },
): Promise<{ eventId: string }> {
  const eventId = randomUUID();
  const payload: Prisma.InputJsonValue = {
    actorId: actor.user_id,
    reason: params.reason,
    before: null,
    after: {
      evidenceId: params.evidenceId,
      employeeId: params.employeeId,
      // Story 8-5 AC2: actorRole lives inside `after` so the
      // outbox-relay actually persists it (audit_events has no
      // top-level actor_role column).
      actorRole: actor.role,
    },
  };
  await tx.outboxEvent.create({
    data: {
      eventId,
      organizationId,
      aggregateType: 'evidence',
      aggregateId: params.evidenceId,
      eventType: 'evidence.rejected',
      payload,
    },
  });
  return { eventId };
}

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
