import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalWorkflow, PromotionMode, VisibilityDefault } from '@prisma/client';

import type { ActorContext } from '../auth/actor-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import { emitApprovalWorkflowChanged, emitPromotionModeChanged, emitVisibilityRuleChanged } from './audit.js';

export type VisibilitySetting = 'OWN_ONLY' | 'TEAM' | 'ORG_SUMMARY' | 'ORG_FULL';
export type ApprovalWorkflowKind = 'SINGLE' | 'DUAL_MANAGER' | 'HR_GATE';
export type PromotionModeValue = 'CALIBRATION' | 'ACTIVE';

const VALID_VISIBILITY: ReadonlyArray<VisibilitySetting> =
  Object.values(VisibilityDefault) as ReadonlyArray<VisibilitySetting>;
const VALID_APPROVAL_WORKFLOW: ReadonlyArray<ApprovalWorkflowKind> =
  Object.values(ApprovalWorkflow) as ReadonlyArray<ApprovalWorkflowKind>;
const VALID_PROMOTION_MODE: ReadonlyArray<PromotionModeValue> =
  Object.values(PromotionMode) as ReadonlyArray<PromotionModeValue>;
const RATIONALE_MIN_FORWARD = 100; // CALIBRATION → ACTIVE per Arch §6.2.

/**
 * OrgSettingsService (Story 7-6, PRD FR-6.6 §8.6, §14.2).
 *
 * Manages organization-level configuration that lives on the
 * `organizations` row directly (not in a child table): for 7-6, the
 * `visibility_default` enum. Story 7-7 will extend this service with
 * `approval_workflow_default`; 7-10 will extend it with the rollout
 * mode admin surface.
 *
 * Visibility changes emit a dedicated `visibility_rule.changed` event
 * (NOT `configuration.changed`) so the Map Data Contract (Epic 10)
 * can subscribe narrowly to invalidate cached projections. The audit
 * relay (Story 3-3) consumes the same outbox row.
 *
 * Idempotent update: setting visibility to its current value is a
 * no-op (no write, no audit emit, no map-cache invalidation event).
 */
@Injectable()
export class OrgSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getVisibility(organizationId: string): Promise<{ visibilityDefault: VisibilitySetting }> {
    // Reviewer H1: wrap in withOrgScope so RLS GUC is set even though
    // the explicit `where: {id: orgId}` already filters. Defense-in-depth
    // matters because the orgId comes from the JWT today, but a future
    // wiring bug that pulls it from a route param tomorrow would otherwise
    // skip the RLS layer entirely.
    return withOrgScope(this.prisma, organizationId, async (tx) => {
      const row = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { visibilityDefault: true },
      });
      if (!row) {
        throw new NotFoundException({ error: 'not_found', message: 'Unknown organization' });
      }
      return { visibilityDefault: row.visibilityDefault as VisibilitySetting };
    });
  }

  async updateVisibility(
    organizationId: string,
    input: { visibilityDefault: VisibilitySetting | string },
    actor: ActorContext,
  ): Promise<{ visibilityDefault: VisibilitySetting }> {
    const next = validateVisibility(input?.visibilityDefault);

    return withOrgScope(this.prisma, organizationId, async (tx) => {
      // Reviewer B1: take a row lock so two concurrent PATCHes flipping
      // OWN_ONLY → ORG_FULL serialize. Without this, both transactions
      // read the same `before`, both update, both emit — yielding two
      // identical `visibility_rule.changed` events for one effective
      // change. The lock is bound to the current tx and releases on
      // commit/rollback. SELECT ... FOR UPDATE is preferred over
      // pg_advisory_xact_lock here because we're locking exactly the
      // row we'll mutate.
      await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;

      const before = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { visibilityDefault: true },
      });
      if (!before) {
        throw new NotFoundException({ error: 'not_found', message: 'Unknown organization' });
      }
      const fromSetting = before.visibilityDefault as VisibilitySetting;
      if (fromSetting === next) {
        // No-op: emitting an audit + map-invalidation event for a
        // no-change PATCH would (a) pollute the audit log and (b)
        // trigger an unnecessary cache rebuild on every Epic-10
        // consumer.
        return { visibilityDefault: fromSetting };
      }
      const after = await tx.organization.update({
        where: { id: organizationId },
        data: { visibilityDefault: next },
        select: { visibilityDefault: true },
      });
      await emitVisibilityRuleChanged(tx, organizationId, actor, {
        fromSetting,
        toSetting: after.visibilityDefault as VisibilitySetting,
      });
      return { visibilityDefault: after.visibilityDefault as VisibilitySetting };
    });
  }

  // ─── Approval Workflow (Story 7-7) ─────────────────────────────────
  //
  // Same shape as visibility: org-level enum column, SELECT FOR UPDATE
  // serialization, idempotent no-op, dedicated `approval_workflow.changed`
  // event for narrow subscribers (Epic 13 promotion workflow).
  //
  // Per-level override (the `/v1/levels/:id/approval-workflow` half of
  // the AC) is **deferred as F7-7a** — no override column exists on
  // `levels` or `promotion_rules`. Adding it requires a Prisma schema
  // migration that's out of scope for the org-level half of this story.

  async getApprovalWorkflow(
    organizationId: string,
  ): Promise<{ approvalWorkflowDefault: ApprovalWorkflowKind }> {
    return withOrgScope(this.prisma, organizationId, async (tx) => {
      const row = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { approvalWorkflowDefault: true },
      });
      if (!row) {
        throw new NotFoundException({ error: 'not_found', message: 'Unknown organization' });
      }
      return { approvalWorkflowDefault: row.approvalWorkflowDefault as ApprovalWorkflowKind };
    });
  }

  async updateApprovalWorkflow(
    organizationId: string,
    input: { approvalWorkflowDefault: ApprovalWorkflowKind | string },
    actor: ActorContext,
  ): Promise<{ approvalWorkflowDefault: ApprovalWorkflowKind }> {
    const next = validateApprovalWorkflow(input?.approvalWorkflowDefault);

    return withOrgScope(this.prisma, organizationId, async (tx) => {
      await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;

      const before = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { approvalWorkflowDefault: true },
      });
      if (!before) {
        throw new NotFoundException({ error: 'not_found', message: 'Unknown organization' });
      }
      const fromKind = before.approvalWorkflowDefault as ApprovalWorkflowKind;
      if (fromKind === next) {
        return { approvalWorkflowDefault: fromKind };
      }
      const after = await tx.organization.update({
        where: { id: organizationId },
        data: { approvalWorkflowDefault: next },
        select: { approvalWorkflowDefault: true },
      });
      await emitApprovalWorkflowChanged(tx, organizationId, actor, {
        fromKind,
        toKind: after.approvalWorkflowDefault as ApprovalWorkflowKind,
      });
      return { approvalWorkflowDefault: after.approvalWorkflowDefault as ApprovalWorkflowKind };
    });
  }

  // ─── Rollout Mode (Story 7-10) ─────────────────────────────────────
  //
  // Reads the current promotion_mode + last-transition metadata.
  // PATCH transitions the mode with rationale validation:
  //   • CALIBRATION → ACTIVE: rationale REQUIRED, ≥ 100 chars per Arch §6.2.
  //   • ACTIVE → CALIBRATION: rationale optional.
  // No-op (same mode) returns current state without emit.
  //
  // **F7-10a deferred**: AC1+AC2 (dedicated `rollout_mode_transitions`
  // + `bootstrap_eligibility_snapshots` tables, with quarterly
  // partitioning, RLS, append-only triggers). The bootstrap snapshot
  // capture requires Epic-9 scoring to produce meaningful score /
  // readiness / promotion_eligible values; capturing zeros today
  // would poison the historical view. The audit event still captures
  // actor + rationale + from/to + timestamp so the transition is
  // queryable from audit_events until F7-10a lands the dedicated
  // table.

  async getPromotionMode(organizationId: string): Promise<{
    promotionMode: PromotionModeValue;
    changedAt: string | null;
    changedBy: string | null;
  }> {
    return withOrgScope(this.prisma, organizationId, async (tx) => {
      const row = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { promotionMode: true, promotionModeChangedAt: true, promotionModeChangedBy: true },
      });
      if (!row) {
        throw new NotFoundException({ error: 'not_found', message: 'Unknown organization' });
      }
      return {
        promotionMode: row.promotionMode as PromotionModeValue,
        changedAt: row.promotionModeChangedAt?.toISOString() ?? null,
        changedBy: row.promotionModeChangedBy ?? null,
      };
    });
  }

  async transitionPromotionMode(
    organizationId: string,
    input: { promotionMode: PromotionModeValue | string; rationale?: string | null },
    actor: ActorContext,
  ): Promise<{
    promotionMode: PromotionModeValue;
    // Nullable to match getPromotionMode: a no-op PATCH on a
    // never-transitioned org returns null/null rather than fabricating
    // the caller as `changedBy` or a 1970 sentinel as `changedAt`.
    changedAt: string | null;
    changedBy: string | null;
  }> {
    const next = validatePromotionMode(input?.promotionMode);

    return withOrgScope(this.prisma, organizationId, async (tx) => {
      // Row-lock so two concurrent transitions serialize.
      await tx.$executeRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;

      const before = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { promotionMode: true, promotionModeChangedAt: true, promotionModeChangedBy: true },
      });
      if (!before) {
        throw new NotFoundException({ error: 'not_found', message: 'Unknown organization' });
      }
      const fromMode = before.promotionMode as PromotionModeValue;

      // Forward-transition rationale gate (Arch §6.2).
      const rationale = validateRationale(input?.rationale, fromMode, next);

      if (fromMode === next) {
        // No-op — return current state without emit. NEVER fabricate
        // changedAt / changedBy: a never-transitioned org returns null
        // for both (matches getPromotionMode's shape), and one that has
        // transitioned returns whatever's recorded on the row.
        return {
          promotionMode: fromMode,
          changedAt: before.promotionModeChangedAt?.toISOString() ?? null,
          changedBy: before.promotionModeChangedBy ?? null,
        };
      }

      const now = new Date();
      const after = await tx.organization.update({
        where: { id: organizationId },
        data: {
          promotionMode: next,
          promotionModeChangedAt: now,
          promotionModeChangedBy: actor.user_id,
        },
        select: { promotionMode: true, promotionModeChangedAt: true, promotionModeChangedBy: true },
      });
      await emitPromotionModeChanged(tx, organizationId, actor, {
        fromMode,
        toMode: after.promotionMode as PromotionModeValue,
        rationale,
      });
      return {
        promotionMode: after.promotionMode as PromotionModeValue,
        changedAt: after.promotionModeChangedAt!.toISOString(),
        changedBy: after.promotionModeChangedBy!,
      };
    });
  }
}

function validateVisibility(raw: unknown): VisibilitySetting {
  if (typeof raw !== 'string' || !VALID_VISIBILITY.includes(raw as VisibilitySetting)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `visibilityDefault must be one of ${VALID_VISIBILITY.join(', ')}`,
    });
  }
  return raw as VisibilitySetting;
}

function validateApprovalWorkflow(raw: unknown): ApprovalWorkflowKind {
  if (typeof raw !== 'string' || !VALID_APPROVAL_WORKFLOW.includes(raw as ApprovalWorkflowKind)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `approvalWorkflowDefault must be one of ${VALID_APPROVAL_WORKFLOW.join(', ')}`,
    });
  }
  return raw as ApprovalWorkflowKind;
}

function validatePromotionMode(raw: unknown): PromotionModeValue {
  if (typeof raw !== 'string' || !VALID_PROMOTION_MODE.includes(raw as PromotionModeValue)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `promotionMode must be one of ${VALID_PROMOTION_MODE.join(', ')}`,
    });
  }
  return raw as PromotionModeValue;
}

// Reviewer L1 note: validation uses `String.length` (UTF-16 code units),
// not grapheme count. A rationale of astral-plane emojis can pass the
// 100-char floor while reading as ~50 graphemes. The floor's intent is
// "operator put real thought into this", not exact char counting, so
// code-unit length is acceptable. Revisit if a real-world admin
// complains.
function validateRationale(
  raw: unknown,
  fromMode: PromotionModeValue,
  toMode: PromotionModeValue,
): string | null {
  if (raw === undefined || raw === null || raw === '') {
    if (fromMode === 'CALIBRATION' && toMode === 'ACTIVE') {
      throw new BadRequestException({
        error: 'bad_request',
        message: `rationale is required for CALIBRATION → ACTIVE transitions (≥ ${RATIONALE_MIN_FORWARD} chars)`,
      });
    }
    return null;
  }
  if (typeof raw !== 'string') {
    throw new BadRequestException({ error: 'bad_request', message: 'rationale must be a string' });
  }
  const trimmed = raw.trim();
  if (fromMode === 'CALIBRATION' && toMode === 'ACTIVE' && trimmed.length < RATIONALE_MIN_FORWARD) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `rationale must be ≥ ${RATIONALE_MIN_FORWARD} chars for CALIBRATION → ACTIVE transitions`,
    });
  }
  return trimmed;
}

