import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
} from '@nestjs/common';

import { ActorContext, type ActorContext as ActorContextType } from '../auth/actor-context.js';
import { Roles } from '../auth/roles.decorator.js';
import {
  ChangeImpactService,
  type ChangeImpactInput,
  type ChangeImpactResult,
} from './change-impact.service.js';

/**
 * Story 7-8 — POST /v1/configuration/preview-impact.
 *
 * Read-only endpoint. Returns `{ affected_employee_count,
 * sample_employee_ids[<=20] }` for a proposed configuration change.
 * Admin Settings UI (Story 7-11) calls this before issuing a
 * destructive PATCH/DELETE so the admin can confirm scope.
 *
 * ADMIN-only — the impact set leaks employee ids and a non-admin role
 * already has visibility rules (Story 7-6) that gate per-employee
 * reads. Centralizing this surface behind ADMIN avoids re-implementing
 * the visibility filter here.
 *
 * Uses 200 (not 201) because no row is created and the response is
 * idempotent given identical input + database state.
 */
@Controller('v1/configuration')
export class ChangeImpactController {
  constructor(@Inject(ChangeImpactService) private readonly service: ChangeImpactService) {}

  @Post('preview-impact')
  @Roles('ADMIN')
  @HttpCode(200)
  async previewImpact(
    @ActorContext() actor: ActorContextType,
    @Body() dto: ChangeImpactInput | null | undefined,
  ): Promise<ChangeImpactResult> {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'entityType and entityId are required',
      });
    }
    return this.service.previewImpact(actor.organization_id, dto);
  }
}
