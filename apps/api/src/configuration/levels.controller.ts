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
import type { LevelRow } from './levels.repository.js';
import {
  LevelsService,
  type CreateLevelInput,
  type UpdateLevelInput,
} from './levels.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Story 7-2 — Levels CRUD API.
 *
 * Routes:
 *   GET     /v1/career-tracks/:trackId/levels  — list levels for a track
 *   GET     /v1/levels/:id                     — fetch by id
 *   POST    /v1/career-tracks/:trackId/levels  — create
 *   PATCH   /v1/levels/:id                     — update (partial)
 *   DELETE  /v1/levels/:id                     — soft-deactivate (no hard delete)
 *
 * Auth (AC1): ADMIN-only on writes; reads are authenticated-only so
 * MANAGER/EMPLOYEE can render level names in the UI. Matches the
 * read-auth nuance pinned by Story 7-1's controller wiring test.
 *
 * Band overlap (AC2) is enforced by the DB exclusion constraint
 * `levels_band_non_overlap`; the service translates the resulting
 * violation into a structured 409 with `conflicting_level_id` and
 * `conflicting_band` so the admin UI can highlight the offending row.
 */
@Controller('v1')
export class LevelsController {
  constructor(@Inject(LevelsService) private readonly service: LevelsService) {}

  @Get('career-tracks/:trackId/levels')
  async list(
    @ActorContext() actor: ActorContextType,
    @Param('trackId') trackId: string,
  ): Promise<LevelRow[]> {
    assertUuid(trackId, 'trackId');
    return this.service.listByTrack(actor.organization_id, trackId);
  }

  @Get('levels/:id')
  async findOne(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
  ): Promise<LevelRow> {
    assertUuid(id, 'id');
    return this.service.findById(actor.organization_id, id);
  }

  @Post('career-tracks/:trackId/levels')
  @Roles('ADMIN')
  @HttpCode(201)
  async create(
    @ActorContext() actor: ActorContextType,
    @Param('trackId') trackId: string,
    @Body() dto: CreateLevelInput,
  ): Promise<LevelRow> {
    assertUuid(trackId, 'trackId');
    return this.service.create(
      actor.organization_id,
      trackId,
      dto ?? ({} as CreateLevelInput),
      actor,
    );
  }

  @Patch('levels/:id')
  @Roles('ADMIN')
  async update(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
    @Body() dto: UpdateLevelInput,
  ): Promise<LevelRow> {
    assertUuid(id, 'id');
    return this.service.update(actor.organization_id, id, dto ?? {}, actor);
  }

  @Delete('levels/:id')
  @Roles('ADMIN')
  async deactivate(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
  ): Promise<LevelRow> {
    assertUuid(id, 'id');
    return this.service.deactivate(actor.organization_id, id, actor);
  }
}

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new BadRequestException({ error: 'bad_request', message: `${label} must be a UUID` });
  }
}
