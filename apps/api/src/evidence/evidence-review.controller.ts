import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Patch,
} from '@nestjs/common';

import {
  ActorContext,
  type ActorContext as ActorContextType,
} from '../auth/actor-context.js';
import { Roles } from '../auth/roles.decorator.js';
import {
  EvidenceReviewService,
  type ApproveInput,
  type ApproveResult,
  type RejectInput,
  type RejectResult,
} from './evidence-review.service.js';

/**
 * Story 8-4 — evidence approve / reject endpoints.
 *
 * Routes:
 *   PATCH /v1/evidence/:id/approve   (body: { reason })
 *   PATCH /v1/evidence/:id/reject    (body: { reason })
 *
 * Auth: MANAGER + ADMIN. EMPLOYEE cannot approve/reject (they only
 * submit). The self-approval guard inside the service additionally
 * rejects a MANAGER/ADMIN acting on their OWN evidence (PRD §9.2).
 *
 * Story 8-5 will add the HR/ADMIN-override path for cross-team
 * approval; the per-row "direct manager" check it implies lands there.
 * For 8-4 we trust that any MANAGER/ADMIN can approve any evidence
 * within their org (filtered by RLS); the manager-of-the-subject
 * check is the visibility-/notification-layer concern of Story 8-5
 * + Epic 14.
 */
@Controller('v1/evidence')
export class EvidenceReviewController {
  constructor(
    @Inject(EvidenceReviewService)
    private readonly service: EvidenceReviewService,
  ) {}

  @Patch(':id/approve')
  @Roles('MANAGER', 'ADMIN')
  @HttpCode(200)
  async approve(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
    @Body() dto: ApproveInput,
  ): Promise<ApproveResult> {
    return this.service.approve(actor, id, dto ?? ({} as ApproveInput));
  }

  @Patch(':id/reject')
  @Roles('MANAGER', 'ADMIN')
  @HttpCode(200)
  async reject(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
    @Body() dto: RejectInput,
  ): Promise<RejectResult> {
    return this.service.reject(actor, id, dto ?? ({} as RejectInput));
  }
}
