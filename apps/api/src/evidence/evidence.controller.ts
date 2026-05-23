import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';

import {
  ActorContext,
  type ActorContext as ActorContextType,
} from '../auth/actor-context.js';
import {
  EvidenceUploadService,
  type CreateUploadSlotInput,
  type CreateUploadSlotResult,
} from './evidence-upload.service.js';
import {
  EvidenceFinalizeService,
  type FinalizeInput,
  type FinalizeResult,
} from './evidence-finalize.service.js';

/**
 * Story 8-2 — pre-signed S3 upload + finalize endpoints.
 *
 * Routes:
 *   POST /v1/requirements/:requirementId/evidence/upload-slot
 *   POST /v1/requirements/:requirementId/evidence/finalize
 *
 * Auth: any authenticated role can submit own evidence (PRD §3.1 —
 * Submit own evidence is allowed to EMPLOYEE / MANAGER / ADMIN). No
 * @Roles guard — the service's actor → employee lookup is the
 * authorization (you can only submit on behalf of yourself, because
 * the employee row is derived from `actor.user_id`).
 *
 * AC3 (forbidden scope) is enforced in EvidenceFinalizeService — keys
 * outside the actor's org return 403.
 *
 * Both endpoints sit under the requirement-id path so the URL
 * encodes the relationship between an evidence row and the
 * requirement it lives against.
 */
@Controller('v1/requirements/:requirementId/evidence')
export class EvidenceController {
  constructor(
    @Inject(EvidenceUploadService)
    private readonly uploadService: EvidenceUploadService,
    @Inject(EvidenceFinalizeService)
    private readonly finalizeService: EvidenceFinalizeService,
  ) {}

  @Post('upload-slot')
  @HttpCode(201)
  async createUploadSlot(
    @ActorContext() actor: ActorContextType,
    @Param('requirementId') requirementId: string,
    @Body() dto: CreateUploadSlotInput,
  ): Promise<CreateUploadSlotResult> {
    return this.uploadService.createUploadSlot(
      actor,
      requirementId,
      dto ?? ({} as CreateUploadSlotInput),
    );
  }

  @Post('finalize')
  async finalize(
    @ActorContext() actor: ActorContextType,
    @Param('requirementId') requirementId: string,
    @Body() dto: FinalizeInput,
  ): Promise<FinalizeResult> {
    return this.finalizeService.finalize(
      actor,
      requirementId,
      dto ?? ({} as FinalizeInput),
    );
  }
}
