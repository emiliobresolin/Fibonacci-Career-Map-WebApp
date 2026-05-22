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
import type { CareerTrackRow } from './career-tracks.repository.js';
import {
  CareerTracksService,
  type CreateCareerTrackInput,
  type UpdateCareerTrackInput,
} from './career-tracks.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Story 7-1 — Career Tracks CRUD API.
 *
 * Routes:
 *   GET     /v1/career-tracks            — list (active only by default)
 *   GET     /v1/career-tracks/:id        — fetch by id
 *   POST    /v1/career-tracks            — create
 *   PATCH   /v1/career-tracks/:id        — update (partial)
 *   DELETE  /v1/career-tracks/:id        — soft-deactivate (no hard delete; AC2)
 *
 * Auth (AC1): ADMIN-only on writes. Reads (GET) are authenticated
 * (any role passes — no @Roles) so MANAGER + EMPLOYEE can resolve
 * track names for UI rendering.
 *
 * Every write goes through `CareerTracksService`, which co-commits a
 * `configuration.changed` outbox row inside the same transaction as
 * the row write (AC3). The outbox-relay (Story 3-3) then persists
 * to audit_events.
 */
@Controller('v1/career-tracks')
export class CareerTracksController {
  constructor(@Inject(CareerTracksService) private readonly service: CareerTracksService) {}

  @Get()
  async list(
    @ActorContext() actor: ActorContextType,
    @Query('includeInactive') includeInactiveRaw?: string,
  ): Promise<CareerTrackRow[]> {
    return this.service.list(actor.organization_id, {
      includeInactive: parseBoolQuery(includeInactiveRaw),
    });
  }

  @Get(':id')
  async findOne(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
  ): Promise<CareerTrackRow> {
    if (!UUID_RE.test(id)) {
      throw new BadRequestException({ error: 'bad_request', message: 'id must be a UUID' });
    }
    return this.service.findById(actor.organization_id, id);
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(201)
  async create(
    @ActorContext() actor: ActorContextType,
    @Body() dto: CreateCareerTrackInput,
  ): Promise<CareerTrackRow> {
    return this.service.create(actor.organization_id, dto ?? ({} as CreateCareerTrackInput), actor);
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
    @Body() dto: UpdateCareerTrackInput,
  ): Promise<CareerTrackRow> {
    if (!UUID_RE.test(id)) {
      throw new BadRequestException({ error: 'bad_request', message: 'id must be a UUID' });
    }
    return this.service.update(actor.organization_id, id, dto ?? {}, actor);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async deactivate(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
  ): Promise<CareerTrackRow> {
    if (!UUID_RE.test(id)) {
      throw new BadRequestException({ error: 'bad_request', message: 'id must be a UUID' });
    }
    return this.service.deactivate(actor.organization_id, id, actor);
  }
}

function parseBoolQuery(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const v = raw.toLowerCase();
  return v === '' || v === 'true' || v === '1' || v === 'yes';
}
