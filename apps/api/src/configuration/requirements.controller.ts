import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { ActorContext, type ActorContext as ActorContextType } from '../auth/actor-context.js';
import { Roles } from '../auth/roles.decorator.js';
import type { RequirementRow } from './requirements.repository.js';
import {
  RequirementsService,
  type CreateRequirementInput,
  type UpdateRequirementInput,
} from './requirements.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Story 7-4 — Requirements CRUD API.
 *
 * Routes:
 *   GET     /v1/layers/:layerId/requirements    — list requirements
 *   GET     /v1/requirements/:id                — fetch by id
 *   POST    /v1/layers/:layerId/requirements    — create
 *   PATCH   /v1/requirements/:id                — update (partial)
 *   DELETE  /v1/requirements/:id                — soft-deactivate
 *
 * AC4: DELETE is soft (active = false). Hard delete is intentionally
 * absent — evidence rows (Epic 8) reference requirements by FK and
 * deletion would break the audit trail.
 */
@Controller('v1')
export class RequirementsController {
  constructor(@Inject(RequirementsService) private readonly service: RequirementsService) {}

  @Get('layers/:layerId/requirements')
  async list(
    @ActorContext() actor: ActorContextType,
    @Param('layerId') layerId: string,
    @Query('includeInactive') includeInactiveRaw?: string,
  ): Promise<RequirementRow[]> {
    assertUuid(layerId, 'layerId');
    return this.service.listByLayer(actor.organization_id, layerId, {
      includeInactive: parseBoolQuery(includeInactiveRaw),
    });
  }

  @Get('requirements/:id')
  async findOne(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
  ): Promise<RequirementRow> {
    assertUuid(id, 'id');
    return this.service.findById(actor.organization_id, id);
  }

  @Post('layers/:layerId/requirements')
  @Roles('ADMIN')
  @HttpCode(201)
  async create(
    @ActorContext() actor: ActorContextType,
    @Param('layerId') layerId: string,
    @Body() dto: CreateRequirementInput,
  ): Promise<RequirementRow> {
    assertUuid(layerId, 'layerId');
    return this.service.create(
      actor.organization_id,
      layerId,
      dto ?? ({} as CreateRequirementInput),
      actor,
    );
  }

  @Patch('requirements/:id')
  @Roles('ADMIN')
  async update(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
    @Body() dto: UpdateRequirementInput,
  ): Promise<RequirementRow> {
    assertUuid(id, 'id');
    return this.service.update(actor.organization_id, id, dto ?? {}, actor);
  }

  @Delete('requirements/:id')
  @Roles('ADMIN')
  async deactivate(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
  ): Promise<RequirementRow> {
    assertUuid(id, 'id');
    return this.service.deactivate(actor.organization_id, id, actor);
  }
}

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new BadRequestException({ error: 'bad_request', message: `${label} must be a UUID` });
  }
}

function parseBoolQuery(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const v = raw.toLowerCase();
  return v === '' || v === 'true' || v === '1' || v === 'yes';
}
