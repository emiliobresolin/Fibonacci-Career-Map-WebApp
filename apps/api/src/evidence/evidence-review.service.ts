import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';

import type { ActorContext } from '../auth/actor-context.js';
import {
  SelfApprovalGuard,
  SelfApprovalNotAllowedError,
} from '../auth/self-approval.guard.js';
import {
  enqueueScoringRecalcEmployee,
  type ScoringRecalcEmployeePayload,
} from '../jobs/enqueue.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import { emitEvidenceApproved, emitEvidenceRejected } from './audit.js';
import { authorizeEvidenceReview } from './evidence-authz.js';
import {
  EvidenceStateMachine,
  IllegalEvidenceTransitionError,
} from './evidence-state-machine.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const APPROVE_REASON_MIN = 10;
const REJECT_REASON_MIN = 20;
const REASON_MAX = 4_000;

export type ApproveInput = { reason: string };
export type RejectInput = { reason: string };

export type ApproveResult = {
  evidenceId: string;
  state: 'APPROVED';
  approvedAt: string;
  expiresAt: string | null;
  approvalRecordId: string;
};

export type RejectResult = {
  evidenceId: string;
  state: 'REJECTED';
  decidedAt: string;
  approvalRecordId: string;
};

/**
 * Evidence approve / reject (Story 8-4, PRD FR-4.5 / FR-4.6 / §6.3).
 *
 * Flow shared by both endpoints:
 *   1. Validate input — evidenceId UUID, reason length per decision
 *      (APPROVE ≥10, REJECT ≥20). Whitespace-trimmed; the DB CHECK
 *      enforces the same floor as defense in depth.
 *   2. Inside `withOrgScope(actor.organization_id)`:
 *      a. SELECT FOR UPDATE on the evidence row + the owner's User
 *         row (we need its user_id for the self-approval guard).
 *      b. Self-approval guard — actor.user_id !== owner User.id, else
 *         403 self_approval_not_allowed (PRD §9.2).
 *      c. State-machine assertion via EvidenceStateMachine — APPROVE
 *         requires PENDING_APPROVAL → APPROVED, REJECT requires
 *         PENDING_APPROVAL → REJECTED. Any other source state raises
 *         IllegalEvidenceTransitionError which surfaces as 409.
 *         (Retroactive APPROVED → REJECTED lives in Story 8-6.)
 *      d. APPROVE: compute `expires_at = NOW + requirement.expiry_months`
 *         (null when the requirement has no expiry). Stamp
 *         `approved_at = NOW`. Update evidence row.
 *         REJECT: just stamp the state change (approved_at stays null
 *         because the row was never approved via this code path).
 *      e. INSERT approval_records row.
 *      f. Emit `evidence.approved` / `evidence.rejected` outbox event.
 *         Co-commits with the row update so audit + state cannot
 *         diverge.
 *      g. Commit.
 *   3. APPROVE only: enqueue a `scoring.recalc-employee` BullMQ job
 *      with `trigger: 'evidence.approved'` so Epic-9 scoring picks
 *      up the change. The enqueue is OUTSIDE the tx (BullMQ +
 *      Postgres are two systems; the outbox-row + audit are durable
 *      so a missed enqueue can be repaired by a Story 9-X repair
 *      job). REJECT does NOT enqueue — a freshly-rejected
 *      pending-evidence change doesn't move the score (the row was
 *      never APPROVED, so no contribution to remove).
 *
 * RBAC posture: the controller does not @Roles-gate; the service
 * relies on the self-approval guard + future PRD §3.1 "approve for
 * direct reports" check (handled at the controller layer in Story
 * 8-5, which extends MANAGER ability with HR/ADMIN override). For
 * 8-4 we trust that any authenticated MANAGER or ADMIN may approve;
 * an EMPLOYEE cannot approve their own evidence (self-approval guard)
 * and cannot approve another EMPLOYEE's evidence (Story 8-5 adds
 * the explicit role check; for now the API surface is open to MANAGER
 * + ADMIN via the controller-layer @Roles guard).
 */
@Injectable()
export class EvidenceReviewService {
  private readonly logger = new Logger(EvidenceReviewService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue('scoring.recalc-employee')
    private readonly recalcQueue: Queue<ScoringRecalcEmployeePayload>,
  ) {}

  async approve(
    actor: ActorContext,
    evidenceId: string,
    input: ApproveInput,
  ): Promise<ApproveResult> {
    const id = validateUuid(evidenceId, 'evidenceId');
    const reason = validateReason(input?.reason, APPROVE_REASON_MIN, 'reason');

    const result = await withOrgScope(this.prisma, actor.organization_id, async (tx) => {
      const row = await this.lockEvidenceWithOwner(tx, id, actor.organization_id);

      try {
        SelfApprovalGuard.ensureNotSelf(actor, row.ownerUserId);
      } catch (err) {
        if (err instanceof SelfApprovalNotAllowedError) {
          throw new ForbiddenException({
            error: 'self_approval_not_allowed',
            message: err.message,
            actorUserId: err.actorUserId,
            subjectUserId: err.subjectUserId,
          });
        }
        throw err;
      }

      // Story 8-5 — DIRECT_MANAGER or ADMIN_OVERRIDE check. Self-
      // approval guard above already rejected owner-acting-on-own;
      // this pass refuses MANAGERs trying to review evidence from
      // outside their team. ADMIN bypasses via the override path.
      // The returned `via` is logged after the tx commits so
      // forensics readers can correlate the decision path with the
      // audit row.
      const reviewVia = await this.assertReviewAuthorized(tx, actor, row.employeeId);

      try {
        EvidenceStateMachine.assertCanTransition(
          row.state as 'PENDING_APPROVAL',
          'APPROVED',
        );
      } catch (err) {
        if (err instanceof IllegalEvidenceTransitionError) {
          throw new ConflictException({
            error: 'illegal_state_transition',
            message: err.message,
            from: err.from,
            to: err.to,
          });
        }
        throw err;
      }

      const approvedAt = new Date();
      // Requirement.expiryMonths may be null (no expiry) — then expires_at
      // stays null. Otherwise: approvedAt + N months. Using setUTCMonth
      // keeps month arithmetic clean across DST + non-Gregorian quirks.
      const expiresAt = row.requirementExpiryMonths
        ? addMonths(approvedAt, row.requirementExpiryMonths)
        : null;

      const updated = await tx.evidence.update({
        where: { id },
        data: {
          state: 'APPROVED',
          approvedAt,
          expiresAt,
        },
      });

      const approvalRecord = await tx.approvalRecord.create({
        data: {
          organizationId: actor.organization_id,
          evidenceId: id,
          actorId: actor.user_id,
          decision: 'APPROVED',
          reason,
          decidedAt: approvedAt,
        },
      });

      await emitEvidenceApproved(tx, actor.organization_id, actor, {
        evidenceId: id,
        employeeId: updated.employeeId,
        reason,
      });

      return {
        approvalRecordId: approvalRecord.id,
        approvedAt,
        expiresAt,
        employeeId: updated.employeeId,
        reviewVia,
      };
    });

    this.logger.log(
      `evidence ${id} APPROVED via=${result.reviewVia} actor=${actor.user_id} approvalRecord=${result.approvalRecordId}`,
    );

    // Enqueue recalc OUTSIDE the tx. BullMQ + Postgres are two systems;
    // the audit row + state are durable, so a missed enqueue here is
    // recoverable via a future repair job (Story 9-X).
    try {
      await enqueueScoringRecalcEmployee(this.recalcQueue, actor, {
        employeeId: result.employeeId,
        trigger: 'evidence.approved',
        originatingEventId: result.approvalRecordId,
      });
    } catch (err) {
      this.logger.error(
        `scoring.recalc-employee enqueue failed for evidence=${id} approvalRecord=${result.approvalRecordId}: ${(err as Error).message}`,
      );
      // Do NOT throw — the approval state + audit are committed.
    }

    return {
      evidenceId: id,
      state: 'APPROVED',
      approvedAt: result.approvedAt.toISOString(),
      expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
      approvalRecordId: result.approvalRecordId,
    };
  }

  async reject(
    actor: ActorContext,
    evidenceId: string,
    input: RejectInput,
  ): Promise<RejectResult> {
    const id = validateUuid(evidenceId, 'evidenceId');
    const reason = validateReason(input?.reason, REJECT_REASON_MIN, 'reason');

    return await withOrgScope(this.prisma, actor.organization_id, async (tx) => {
      const row = await this.lockEvidenceWithOwner(tx, id, actor.organization_id);

      try {
        SelfApprovalGuard.ensureNotSelf(actor, row.ownerUserId);
      } catch (err) {
        if (err instanceof SelfApprovalNotAllowedError) {
          throw new ForbiddenException({
            error: 'self_approval_not_allowed',
            message: err.message,
            actorUserId: err.actorUserId,
            subjectUserId: err.subjectUserId,
          });
        }
        throw err;
      }

      // Story 8-5 — DIRECT_MANAGER or ADMIN_OVERRIDE check. Self-
      // approval guard above already rejected owner-acting-on-own;
      // this pass refuses MANAGERs trying to review evidence from
      // outside their team. ADMIN bypasses via the override path.
      // The returned `via` is logged after the tx commits so
      // forensics readers can correlate the decision path with the
      // audit row.
      const reviewVia = await this.assertReviewAuthorized(tx, actor, row.employeeId);

      // Story 8-4 handles the PENDING_APPROVAL → REJECTED transition
      // only. APPROVED → REJECTED is legal in the state machine
      // (retroactive rejection per FR-4.7) but lands in Story 8-6
      // with its own code path (score recalc, audit context). Refuse
      // it here so the surface is sharp: this endpoint is for the
      // first-pass review only. APPROVED gets a distinct error code
      // so the client can route to the retroactive surface once 8-6
      // ships; truly illegal sources (DRAFT/REJECTED/EXPIRED) get
      // the generic illegal_state_transition.
      if (row.state === 'APPROVED') {
        throw new ConflictException({
          error: 'use_retroactive_reject_endpoint',
          message:
            'Approved evidence is rejected via the retroactive-rejection endpoint (Story 8-6), not this one',
          from: row.state,
          to: 'REJECTED',
        });
      }
      if (row.state !== 'PENDING_APPROVAL') {
        throw new ConflictException({
          error: 'illegal_state_transition',
          message: `Cannot reject evidence in state ${row.state}; only PENDING_APPROVAL is supported by this endpoint`,
          from: row.state,
          to: 'REJECTED',
        });
      }
      // Belt-and-braces: state machine also confirms the edge is
      // legal. This is a tautology given the explicit check above,
      // but keeps the symmetry with approve() in case the explicit
      // check is ever loosened.
      try {
        EvidenceStateMachine.assertCanTransition('PENDING_APPROVAL', 'REJECTED');
      } catch (err) {
        if (err instanceof IllegalEvidenceTransitionError) {
          throw new ConflictException({
            error: 'illegal_state_transition',
            message: err.message,
            from: err.from,
            to: err.to,
          });
        }
        throw err;
      }

      const decidedAt = new Date();
      const updated = await tx.evidence.update({
        where: { id },
        data: {
          state: 'REJECTED',
          // approved_at stays null for a never-approved rejection.
          // (Retroactive rejection of an APPROVED row preserves
          // approved_at via Story 8-6's separate code path.)
        },
      });

      const approvalRecord = await tx.approvalRecord.create({
        data: {
          organizationId: actor.organization_id,
          evidenceId: id,
          actorId: actor.user_id,
          decision: 'REJECTED',
          reason,
          decidedAt,
        },
      });

      await emitEvidenceRejected(tx, actor.organization_id, actor, {
        evidenceId: id,
        employeeId: updated.employeeId,
        reason,
      });

      this.logger.log(
        `evidence ${id} REJECTED via=${reviewVia} actor=${actor.user_id} approvalRecord=${approvalRecord.id}`,
      );

      return {
        evidenceId: id,
        state: 'REJECTED' as const,
        decidedAt: decidedAt.toISOString(),
        approvalRecordId: approvalRecord.id,
      };
    });
  }

  // ── helpers ─────────────────────────────────────────────────────

  /**
   * Story 8-5 — assert the actor is allowed to review (approve/reject)
   * the subject's evidence. Loads the actor's employee row in this
   * org + the subject's active assignments, then runs
   * {@link authorizeEvidenceReview}. Throws 403 with the structured
   * error code on denial.
   *
   * Runs INSIDE the same withOrgScope tx so the lookups are RLS-
   * scoped to the actor's organization (defense in depth, even
   * though `actor.organization_id` is also enforced by withOrgScope
   * itself).
   */
  private async assertReviewAuthorized(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    subjectEmployeeId: string,
  ): Promise<'DIRECT_MANAGER' | 'ADMIN_OVERRIDE'> {
    // ADMIN short-circuits — no need to load employee rows.
    if (actor.role === 'ADMIN') {
      return 'ADMIN_OVERRIDE';
    }
    // Parallel loads — the actor's employee row and the subject's
    // active assignments are independent reads. Running sequentially
    // (await + await) holds the SELECT FOR UPDATE row lock longer
    // than necessary under contention.
    const [actorEmployee, subjectAssignments] = await Promise.all([
      tx.employee.findFirst({
        where: {
          userId: actor.user_id,
          organizationId: actor.organization_id,
          deactivatedAt: null,
        },
        select: { id: true },
      }),
      tx.employeeAssignment.findMany({
        where: {
          employeeId: subjectEmployeeId,
          // Defense-in-depth org_id predicate mirrors actor-employee
          // query; RLS already scopes via withOrgScope, but a belt-
          // and-braces predicate dodges a future RLS regression.
          organizationId: actor.organization_id,
          deactivatedAt: null,
        },
        select: { managerEmployeeId: true, deactivatedAt: true },
      }),
    ]);
    const authz = authorizeEvidenceReview({
      actor: { role: actor.role },
      actorEmployee,
      subjectAssignments,
    });
    if (!authz.allowed) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: authz.reason,
      });
    }
    return authz.via;
  }

  /** Lock the evidence row + resolve the owner User.id. Used by both
   *  approve and reject so the self-approval guard has the actor's
   *  subject user_id available. */
  private async lockEvidenceWithOwner(
    tx: Prisma.TransactionClient,
    evidenceId: string,
    organizationId: string,
  ): Promise<{
    state: string;
    employeeId: string;
    requirementExpiryMonths: number | null;
    ownerUserId: string;
  }> {
    // SELECT FOR UPDATE on the evidence row, joining employee for the
    // owner User and requirement for expiry_months. UUID is param-
    // bound; no injection surface.
    //
    // Defense-in-depth on organization_id: RLS already scopes via the
    // `app.current_org_id` GUC, but a belt-and-braces predicate on
    // the WHERE clause closes the timing channel that would let a
    // cross-org id probe distinguish "row exists but RLS hides it"
    // from "row missing" through query duration. Matches the post-
    // review fix from Story 8-3.
    const locked = await tx.$queryRaw<
      Array<{
        state: string;
        employee_id: string;
        owner_user_id: string;
        expiry_months: number | null;
      }>
    >(Prisma.sql`
      SELECT e.state, e.employee_id, emp.user_id AS owner_user_id, req.expiry_months
        FROM evidence e
        JOIN employees emp    ON emp.id = e.employee_id
        JOIN requirements req ON req.id = e.requirement_id
       WHERE e.id = ${evidenceId}::uuid
         AND e.organization_id = ${organizationId}::uuid
       FOR UPDATE OF e
    `);
    const row = locked[0];
    if (!row) {
      throw new NotFoundException({
        error: 'not_found',
        message: 'Unknown evidence id',
      });
    }
    return {
      state: row.state,
      employeeId: row.employee_id,
      ownerUserId: row.owner_user_id,
      requirementExpiryMonths: row.expiry_months,
    };
  }
}

function validateUuid(raw: unknown, name: string): string {
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${name} must be a UUID`,
    });
  }
  return raw;
}

function validateReason(raw: unknown, min: number, name: string): string {
  if (typeof raw !== 'string') {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${name} is required`,
    });
  }
  const trimmed = raw.trim();
  if (trimmed.length < min) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${name} must be at least ${min} characters (got ${trimmed.length})`,
    });
  }
  if (trimmed.length > REASON_MAX) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${name} must be ≤${REASON_MAX} characters`,
    });
  }
  return trimmed;
}

/** Add N months to a Date in UTC and clamp the day-of-month so the
 *  result lands on the same calendar day OR the last day of the
 *  target month when the source day doesn't exist there.
 *
 *  Why not just setUTCMonth: a Feb-29 input with months=12 would
 *  roll forward to Mar-1 (Date arithmetic overflow), which is one
 *  day past what HR intuition expects ("expires the day before the
 *  next leap day"). We detect the rollover by comparing the day-of-
 *  month after setUTCMonth: if it changed, we explicitly walk back
 *  to the last day of the intended month via setUTCDate(0). Same
 *  pattern Postgres `interval '12 month'` arithmetic uses for
 *  `'2024-02-29'::date + INTERVAL '1 year'` → `2025-02-28`. */
function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  const targetMonth = out.getUTCMonth() + months;
  out.setUTCMonth(targetMonth);
  // After setUTCMonth, JS may have rolled forward by a day if the
  // source day-of-month doesn't exist in the target month (Feb 29 →
  // Mar 1). Detect by comparing the post-set day against the source;
  // if it doesn't equal the source AND the month rolled past the
  // intended target, clamp to the last day of the intended month.
  if (out.getUTCMonth() !== ((targetMonth % 12) + 12) % 12) {
    // setUTCDate(0) jumps back to the last day of the previous month
    // (which IS the intended target month, since we overshot by one).
    out.setUTCDate(0);
  }
  return out;
}

// Re-export for tests / future controllers that need to map the guard
// error to a 403.
export { SelfApprovalNotAllowedError };
