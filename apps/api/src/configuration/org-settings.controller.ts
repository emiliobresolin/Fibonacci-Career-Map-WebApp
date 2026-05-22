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
  type VisibilitySetting,
} from './org-settings.service.js';

/**
 * Story 7-6 — Visibility Rule admin endpoints (per PRD FR-6.6).
 *
 * Routes:
 *   GET    /v1/organizations/me/visibility
 *   PATCH  /v1/organizations/me/visibility   { visibilityDefault: 'OWN_ONLY' | 'TEAM' | 'ORG_SUMMARY' | 'ORG_FULL' }
 *
 * "me" resolves to the actor's organization from the JWT — there's no
 * surface for cross-org visibility writes (those would be an admin-
 * console workflow, not in the per-tenant API).
 *
 * Both endpoints require ADMIN. The PATCH emits one
 * `visibility_rule.changed` outbox event that drives both audit
 * (Story 3-3 relay) and Map cache invalidation (Epic 10 consumer).
 */
@Controller('v1/organizations/me/visibility')
export class OrgSettingsController {
  constructor(@Inject(OrgSettingsService) private readonly service: OrgSettingsService) {}

  @Get()
  @Roles('ADMIN')
  async getVisibility(
    @ActorContext() actor: ActorContextType,
  ): Promise<{ visibilityDefault: VisibilitySetting }> {
    return this.service.getVisibility(actor.organization_id);
  }

  @Patch()
  @Roles('ADMIN')
  async updateVisibility(
    @ActorContext() actor: ActorContextType,
    @Body() dto: { visibilityDefault: VisibilitySetting | string } | null | undefined,
  ): Promise<{ visibilityDefault: VisibilitySetting }> {
    // Reviewer M2: a missing body should say "required", not "must be one
    // of …". Hand the validator a marker that produces the right message.
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'visibilityDefault is required',
      });
    }
    return this.service.updateVisibility(actor.organization_id, dto, actor);
  }
}
