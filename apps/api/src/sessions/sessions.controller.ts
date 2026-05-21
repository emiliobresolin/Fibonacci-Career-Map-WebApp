import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { JwtService } from '../auth/jwt.service.js';
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
 * Inline JWT decode + role check until Story 2-4 ships the global
 * AuthGuard. Same pattern the audit-read controller uses.
 */
@Controller('auth/sessions')
export class SessionsController {
  constructor(
    @Inject(SessionStoreService) private readonly sessions: SessionStoreService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Post(':userId/revoke')
  async revoke(@Req() req: Request, @Param('userId') userId: string): Promise<{ revokedSessions: number }> {
    const actor = await this.requireAdmin(req);
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
    if (!target || target.organizationId !== actor.organizationId) {
      // 404-shape to avoid leaking org membership.
      throw new BadRequestException('Unknown user');
    }

    const revokedCount = await this.sessions.revokeAll({
      organizationId: actor.organizationId,
      userId,
    });

    // Audit emission via outbox (AC4). The relay (Story 3-3) validates
    // this payload against the AuditEvent taxonomy (Story 3-4 added the
    // session.revoked variant) and lands an audit_events row.
    const eventId = randomUUID();
    await this.prisma.outboxEvent.create({
      data: {
        eventId,
        organizationId: actor.organizationId,
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

  private async requireAdmin(req: Request): Promise<{ sub: string; organizationId: string; role: 'ADMIN' }> {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    const payload = await this.jwt.verifyAccess(token);
    if (payload.role !== 'ADMIN') {
      throw new ForbiddenException('Admin role required to revoke sessions');
    }
    return { sub: payload.sub, organizationId: payload.org, role: 'ADMIN' };
  }
}
