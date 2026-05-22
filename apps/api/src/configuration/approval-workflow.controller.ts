import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Patch,
} from '@nestjs/common';

import { ActorContext, type ActorContext as ActorContextType } from '../auth/actor-context.js';
import { Roles } from '../auth/roles.decorator.js';
import {
  OrgSettingsService,
  type ApprovalWorkflowKind,
} from './org-settings.service.js';

/**
 * Story 7-7 — Approval-workflow admin endpoints (org-level half).
 *
 * Routes:
 *   GET    /v1/organizations/me/approval-workflow
 *   PATCH  /v1/organizations/me/approval-workflow  { approvalWorkflowDefault: 'SINGLE' | 'DUAL_MANAGER' | 'HR_GATE' }
 *
 * Per-level overrides (`GET/PATCH /v1/levels/:id/approval-workflow`)
 * are **deferred as F7-7a**: the schema has no override column on
 * `levels` or `promotion_rules` yet, and adding one requires a
 * Prisma migration out of scope for this story. The promotion-rule
 * `managerRequired` / `hrRequired` booleans (Story 7-5) carry the
 * substantive override semantics for SINGLE vs HR_GATE today;
 * DUAL_MANAGER requires the new column.
 */
@Controller('v1/organizations/me/approval-workflow')
export class ApprovalWorkflowController {
  constructor(@Inject(OrgSettingsService) private readonly service: OrgSettingsService) {}

  @Get()
  @Roles('ADMIN')
  async getApprovalWorkflow(
    @ActorContext() actor: ActorContextType,
  ): Promise<{ approvalWorkflowDefault: ApprovalWorkflowKind }> {
    return this.service.getApprovalWorkflow(actor.organization_id);
  }

  @Patch()
  @Roles('ADMIN')
  async updateApprovalWorkflow(
    @ActorContext() actor: ActorContextType,
    @Body() dto: { approvalWorkflowDefault: ApprovalWorkflowKind | string } | null | undefined,
  ): Promise<{ approvalWorkflowDefault: ApprovalWorkflowKind }> {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'approvalWorkflowDefault is required',
      });
    }
    return this.service.updateApprovalWorkflow(actor.organization_id, dto, actor);
  }
}
