import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { JwtService } from '../auth/jwt.service.js';
import { AuditService } from './audit.service.js';
import type { ActorClaims, AuditListQuery } from './audit.types.js';

const VALID_EVENT_TYPES = new Set([
  'evidence.submitted',
  'evidence.approved',
  'evidence.rejected',
  'score.recalculated',
  'configuration.changed',
  'promotion.initiated',
  'promotion.decided',
  'promotion.completed',
  'role_assignment.changed',
  'visibility_rule.changed',
  'approval_workflow.changed',
]);

/**
 * Audit read controller (Story 3-5).
 *
 *   GET /v1/audit-events            — cursor-paginated list (AC1)
 *   GET /v1/audit-events/export     — CSV stream (AC2)
 *
 * RBAC is enforced by `AuditService.list` based on `ActorClaims.role`.
 * The bearer-token decode happens inline here until Story 2-4 ships the
 * global AuthGuard + ActorContext primitive — at which point this
 * controller swaps the inline decode for a `@Roles()` decorator and
 * reads `req.user`.
 */
@Controller('v1/audit-events')
export class AuditController {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  @Get()
  async list(@Req() req: Request, @Query() raw: Record<string, string | undefined>) {
    const actor = await this.requireActor(req);
    const query = parseQuery(raw);
    return this.audit.list(actor, query);
  }

  @Get('export')
  async exportCsv(
    @Req() req: Request,
    @Res() res: Response,
    @Query() raw: Record<string, string | undefined>,
  ): Promise<void> {
    const actor = await this.requireActor(req);
    const query = parseQuery(raw);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="audit-events-${Date.now()}.csv"`);
    for await (const chunk of this.audit.exportCsv(actor, query)) {
      if (!res.write(chunk)) {
        // Backpressure: wait for the socket to drain before continuing.
        await new Promise<void>((resolve) => res.once('drain', resolve));
      }
    }
    res.end();
  }

  /** Inline JWT decode — replaced by global AuthGuard in Story 2-4. */
  private async requireActor(req: Request): Promise<ActorClaims> {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    const payload = await this.jwt.verifyAccess(token);
    return { sub: payload.sub, organizationId: payload.org, role: payload.role };
  }
}

function parseQuery(raw: Record<string, string | undefined>): AuditListQuery {
  const q: AuditListQuery = {};
  if (raw['actor_id']) q.actorId = assertUuid(raw['actor_id'], 'actor_id');
  const evtType = raw['event_type'];
  if (evtType) {
    if (!VALID_EVENT_TYPES.has(evtType)) {
      throw new BadRequestException(`Unknown event_type: ${evtType}`);
    }
    q.eventType = evtType as NonNullable<AuditListQuery['eventType']>;
  }
  if (raw['entity_type']) q.entityType = raw['entity_type'];
  if (raw['entity_id']) q.entityId = assertUuid(raw['entity_id'], 'entity_id');
  if (raw['occurred_from']) q.occurredFrom = assertIso(raw['occurred_from'], 'occurred_from');
  if (raw['occurred_to']) q.occurredTo = assertIso(raw['occurred_to'], 'occurred_to');
  if (raw['cursor']) q.cursor = raw['cursor'];
  if (raw['limit']) {
    const n = Number(raw['limit']);
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException(`Invalid limit: ${raw['limit']}`);
    }
    q.limit = n;
  }
  return q;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, field: string): string {
  if (!UUID_RE.test(value)) throw new BadRequestException(`${field} must be a UUID`);
  return value;
}

function assertIso(value: string, field: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`${field} must be an ISO timestamp`);
  }
  return value;
}
