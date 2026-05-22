import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { ActorContext, type ActorContext as ActorContextType } from '../auth/actor-context.js';
import { Roles } from '../auth/roles.decorator.js';
import type { PromotionRuleRow } from './promotion-rules.repository.js';
import {
  PromotionRulesService,
  type CreatePromotionRuleInput,
  type UpdatePromotionRuleInput,
} from './promotion-rules.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Story 7-5 — Promotion Rules CRUD API.
 *
 * Routes (1:1 per level — singular resource):
 *   GET    /v1/levels/:levelId/promotion-rule    — fetch the rule for this level
 *   POST   /v1/levels/:levelId/promotion-rule    — create (409 if one already exists)
 *   PATCH  /v1/levels/:levelId/promotion-rule    — update (404 if no rule yet)
 *
 * No DELETE endpoint — a level cannot exist without its promotion
 * rule (the eligibility evaluator would have nothing to gate on).
 * To "remove" a rule, an admin deactivates the parent level (7-2).
 */
@Controller('v1/levels/:levelId/promotion-rule')
export class PromotionRulesController {
  constructor(@Inject(PromotionRulesService) private readonly service: PromotionRulesService) {}

  @Get()
  async findOne(
    @ActorContext() actor: ActorContextType,
    @Param('levelId') levelId: string,
  ): Promise<PromotionRuleRow> {
    assertUuid(levelId, 'levelId');
    return this.service.findByLevelId(actor.organization_id, levelId);
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(201)
  async create(
    @ActorContext() actor: ActorContextType,
    @Param('levelId') levelId: string,
    @Body() dto: CreatePromotionRuleInput,
  ): Promise<PromotionRuleRow> {
    assertUuid(levelId, 'levelId');
    return this.service.create(
      actor.organization_id,
      levelId,
      dto ?? ({} as CreatePromotionRuleInput),
      actor,
    );
  }

  @Patch()
  @Roles('ADMIN')
  async update(
    @ActorContext() actor: ActorContextType,
    @Param('levelId') levelId: string,
    @Body() dto: UpdatePromotionRuleInput,
  ): Promise<PromotionRuleRow> {
    assertUuid(levelId, 'levelId');
    return this.service.updateByLevelId(actor.organization_id, levelId, dto ?? {}, actor);
  }
}

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new BadRequestException({ error: 'bad_request', message: `${label} must be a UUID` });
  }
}
