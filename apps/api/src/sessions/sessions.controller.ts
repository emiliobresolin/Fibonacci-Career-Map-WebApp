import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Controller,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../auth/roles.decorator.js';
import type { RequestUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SessionStoreService } from './session-store.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin session-management surface (Story 2-3 AC2).
 *
 *   POST /auth/sessions/:user_id/revoke   — admin-only forced logout
 *
 * Drops every Redis session record for the target user, then emits an
 * outbox row tagged `session.revoked` so the relay (Story 3-3) lands
 * an immutable audit_events row. Cross-org enforcement: the actor's
 * organizationId must match the target user's organizationId — no
 * cross-tenant revocation.
 *
 * AuthN + role check delegated to the global JwtAuthGuard + @Roles
 * (Story 2-4); this controller now reads the verified actor from
 * `req.user` and focuses on the revoke side-effect.
 */
@Controller('auth/sessions')
@Roles('ADMIN')
export class SessionsController {
  constructor(
    @Inject(SessionStoreService) private readonly sessions: SessionStoreService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Post(':userId/revoke')
  async revoke(@Req() req: Request, @Param('userId') userId: string): Promise<{ revokedSessions: number }> {
    const actor = (req as Request & { user?: RequestUser }).user;
    if (!actor) {
      // Defensive: the guard should have rejected before reaching here.
      // 401 surfaces a misconfigured guard as an auth failure rather than 500.
      throw new UnauthorizedException('Authentication context missing');
    }
    if (!UUID_RE.test(userId)) {
      throw new BadRequestException('userId must be a UUID');
    }

    // Cross-org guard: confirm the target user belongs to the actor's
    // organization. Without this, a compromised admin token from org A
    // could forcibly log out users in org B.
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, organizationId: true },
    });
    if (!target || target.organizationId !== actor.organization_id) {
      // 404-shape to avoid leaking org membership.
      throw new BadRequestException('Unknown user');
    }

    const revokedCount = await this.sessions.revokeAll({
      organizationId: actor.organization_id,
      userId,
    });

    // Audit emission via outbox (AC4). The relay (Story 3-3) validates
    // this payload against the AuditEvent taxonomy (Story 3-4 added the
    // session.revoked variant) and lands an audit_events row.
    const eventId = randomUUID();
    await this.prisma.outboxEvent.create({
      data: {
        eventId,
        organizationId: actor.organization_id,
        aggregateType: 'session',
        aggregateId: userId,
        eventType: 'session.revoked',
        payload: {
          reason: 'Admin-initiated forced logout',
          before: {
            targetUserId: userId,
            revokedSessionCount: revokedCount,
          },
          after: null,
        },
      },
    });

    return { revokedSessions: revokedCount };
  }
}
