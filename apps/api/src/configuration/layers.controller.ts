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
} from '@nestjs/common';

import { ActorContext, type ActorContext as ActorContextType } from '../auth/actor-context.js';
import { Roles } from '../auth/roles.decorator.js';
import type { LayerRow } from './layers.repository.js';
import {
  LayersService,
  type CreateLayerInput,
  type UpdateLayerInput,
} from './layers.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Story 7-3 — Layers CRUD API.
 *
 * Routes:
 *   GET     /v1/levels/:levelId/layers  — list layers for a level
 *   GET     /v1/layers/:id              — fetch by id
 *   POST    /v1/levels/:levelId/layers  — create
 *   PATCH   /v1/layers/:id              — update (partial)
 *   DELETE  /v1/layers/:id              — hard delete (last-layer guarded as 409)
 *
 * Same auth posture as 7-1 / 7-2: ADMIN-only on writes; reads are
 * authenticated-only so MANAGER + EMPLOYEE can render layer names in
 * the UI.
 */
@Controller('v1')
export class LayersController {
  constructor(@Inject(LayersService) private readonly service: LayersService) {}

  @Get('levels/:levelId/layers')
  async list(
    @ActorContext() actor: ActorContextType,
    @Param('levelId') levelId: string,
  ): Promise<LayerRow[]> {
    assertUuid(levelId, 'levelId');
    return this.service.listByLevel(actor.organization_id, levelId);
  }

  @Get('layers/:id')
  async findOne(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
  ): Promise<LayerRow> {
    assertUuid(id, 'id');
    return this.service.findById(actor.organization_id, id);
  }

  @Post('levels/:levelId/layers')
  @Roles('ADMIN')
  @HttpCode(201)
  async create(
    @ActorContext() actor: ActorContextType,
    @Param('levelId') levelId: string,
    @Body() dto: CreateLayerInput,
  ): Promise<LayerRow> {
    assertUuid(levelId, 'levelId');
    return this.service.create(
      actor.organization_id,
      levelId,
      dto ?? ({} as CreateLayerInput),
      actor,
    );
  }

  @Patch('layers/:id')
  @Roles('ADMIN')
  async update(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
    @Body() dto: UpdateLayerInput,
  ): Promise<LayerRow> {
    assertUuid(id, 'id');
    return this.service.update(actor.organization_id, id, dto ?? {}, actor);
  }

  @Delete('layers/:id')
  @Roles('ADMIN')
  @HttpCode(204)
  async remove(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
  ): Promise<void> {
    assertUuid(id, 'id');
    await this.service.remove(actor.organization_id, id, actor);
  }
}

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new BadRequestException({ error: 'bad_request', message: `${label} must be a UUID` });
  }
}
