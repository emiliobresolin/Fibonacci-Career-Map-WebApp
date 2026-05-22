import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalWorkflow, VisibilityDefault } from '@prisma/client';

import type { ActorContext } from '../auth/actor-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import { emitApprovalWorkflowChanged, emitVisibilityRuleChanged } from './audit.js';

export type VisibilitySetting = 'OWN_ONLY' | 'TEAM' | 'ORG_SUMMARY' | 'ORG_FULL';
export type ApprovalWorkflowKind = 'SINGLE' | 'DUAL_MANAGER' | 'HR_GATE';

const VALID_VISIBILITY: ReadonlyArray<VisibilitySetting> =
  Object.values(VisibilityDefault) as ReadonlyArray<VisibilitySetting>;
const VALID_APPROVAL_WORKFLOW: ReadonlyArray<ApprovalWorkflowKind> =
  Object.values(ApprovalWorkflow) as ReadonlyArray<ApprovalWorkflowKind>;

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

