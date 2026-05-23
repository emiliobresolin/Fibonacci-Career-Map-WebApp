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
  type PromotionModeValue,
} from './org-settings.service.js';

/**
 * Story 7-10 — Rollout mode admin endpoints.
 *
 * Routes:
 *   GET   /v1/organizations/me/promotion-mode
 *   PATCH /v1/organizations/me/promotion-mode  { promotionMode, rationale? }
 *
 * CALIBRATION → ACTIVE requires `rationale` ≥ 100 chars (Arch §6.2 +
 * PRD FR-7.14). ACTIVE → CALIBRATION accepts an optional rationale.
 * No-op (same mode) returns current state without emit.
 *
 * **F7-10a deferred**: dedicated `rollout_mode_transitions` table +
 * `bootstrap_eligibility_snapshots` (AC1 + AC2 of the original spec)
 * require Epic-9 scoring for meaningful snapshot values. The audit
 * event still captures actor + rationale + from/to so the transition
 * trail is queryable from `audit_events` in the meantime.
 */
@Controller('v1/organizations/me/promotion-mode')
export class PromotionModeController {
  constructor(@Inject(OrgSettingsService) private readonly service: OrgSettingsService) {}

  @Get()
  @Roles('ADMIN')
  async getPromotionMode(@ActorContext() actor: ActorContextType) {
    return this.service.getPromotionMode(actor.organization_id);
  }

  @Patch()
  @Roles('ADMIN')
  async transitionPromotionMode(
    @ActorContext() actor: ActorContextType,
    @Body() dto: { promotionMode: PromotionModeValue | string; rationale?: string | null } | null | undefined,
  ) {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'promotionMode is required',
      });
    }
    return this.service.transitionPromotionMode(actor.organization_id, dto, actor);
  }
}
