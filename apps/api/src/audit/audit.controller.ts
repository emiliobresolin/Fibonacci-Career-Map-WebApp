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

import { Roles } from '../auth/roles.decorator.js';
import type { RequestUser } from '../auth/auth.types.js';
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
 * AuthN is delegated to the global JwtAuthGuard (Story 2-4). RBAC scope
 * inside the result set (admin sees all org events, manager/employee see
 * self-only) is enforced inside `AuditService.list` against the
 * `actor.role`. Both roles are listed in `@Roles` so the guard returns
 * 403 for unknown roles before we ever hit the service.
 */
@Controller('v1/audit-events')
@Roles('EMPLOYEE', 'MANAGER', 'ADMIN')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  async list(@Req() req: Request, @Query() raw: Record<string, string | undefined>) {
    const actor = toActorClaims(req);
    const query = parseQuery(raw);
    return this.audit.list(actor, query);
  }

  @Get('export')
  async exportCsv(
    @Req() req: Request,
    @Res() res: Response,
    @Query() raw: Record<string, string | undefined>,
  ): Promise<void> {
    const actor = toActorClaims(req);
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
}

function toActorClaims(req: Request): ActorClaims {
  // The guard guarantees `user` is populated on every authenticated route;
  // we still assert here so a missing-user condition is loud rather than
  // producing a malformed Prisma query.
  const user = (req as Request & { user?: RequestUser }).user;
  if (!user) {
    // Defensive: the guard should have rejected before reaching here.
    // 401 (not 500) so a misconfigured guard surfaces as an auth failure
    // rather than a server error that leaks an internal-invariant message.
    throw new UnauthorizedException('Authentication context missing');
  }
  return {
    sub: user.user_id,
    organizationId: user.organization_id,
    role: user.role,
  };
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
