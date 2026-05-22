import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';

import type { ActorContext } from '../auth/actor-context.js';
import { actorContextFromRequestUser } from '../auth/actor-context.js';
import { JwtService } from '../auth/jwt.service.js';
import type { Env } from '../common/env.config.js';
import { parseOrigins } from '../common/env.config.js';
import { SessionStoreService } from '../sessions/session-store.service.js';

/**
 * FCM realtime gateway (Story 5-1 + 5-2).
 *
 * Hosts the Socket.IO namespace `/`. Connection lifecycle owns:
 *   • correlation_id stamping (Story 5-1 AC3) — preserves inbound
 *     X-Request-Id or mints a fresh UUID.
 *   • JWT handshake auth (Story 5-2 AC1) — extracts the bearer token
 *     from `handshake.auth.token` (preferred) or the
 *     `Authorization: Bearer <token>` header (fallback), verifies via
 *     `JwtService`, runs the same forced-logout check against
 *     `SessionStoreService` the HTTP guard runs, and disconnects
 *     with a structured reason on any failure.
 *   • ActorContext propagation (Story 5-2 AC2) — populates
 *     `socket.data.actor` so per-event handlers can extract it via
 *     `actorFromSocket(socket)` (apps/api/src/auth/actor-context.ts).
 *
 * Room-join authorization + outbound-event filtering land in Stories
 * 5-3 / 5-4; this story owns the connect-time gate.
 *
 * CORS allow-list is the SAME `CORS_ALLOWED_ORIGINS` env var used by
 * the HTTP layer (Story 2-4). Production env-validation requires it.
 */
@WebSocketGateway({
  cors: {
    credentials: true,
    origin: (origin, cb): void => {
      // Lazy resolution of the allow-list — read at connect time, not
      // at module load. Lets a config rotation take effect without
      // bouncing every API pod.
      if (!origin) return cb(null, true);
      const allowed = parseOrigins(process.env['CORS_ALLOWED_ORIGINS']);
      const normalised = origin.replace(/\/+$/, '');
      cb(null, allowed.includes(normalised));
    },
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(SessionStoreService) private readonly sessions: SessionStoreService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    // Story 5-1 AC3 — correlation_id stamped FIRST so even the auth-
    // failure log line carries it.
    const headers = client.handshake.headers;
    const inboundId = headers['x-request-id'];
    const correlationId =
      typeof inboundId === 'string'
        ? inboundId
        : Array.isArray(inboundId)
          ? inboundId[0]!
          : randomUUID();
    (client.data as { correlation_id?: string }).correlation_id = correlationId;

    // Story 5-2 AC1 — extract + verify the JWT. Token sources, in order:
    //   1. handshake.auth.token — set by socket.io-client via `auth: { token }`
    //   2. Authorization: Bearer <token> header — set by direct upgrade calls
    // Anything else is a missing-token rejection.
    const token = extractToken(client);
    if (!token) {
      this.logger.warn(
        { correlation_id: correlationId, op: 'ws_auth_fail', reason: 'missing_token' },
        'WebSocket handshake rejected: missing bearer token',
      );
      client.disconnect(true);
      return;
    }

    let payload;
    try {
      payload = await this.jwt.verifyAccess(token);
    } catch {
      this.logger.warn(
        { correlation_id: correlationId, op: 'ws_auth_fail', reason: 'invalid_token' },
        'WebSocket handshake rejected: invalid or expired token',
      );
      client.disconnect(true);
      return;
    }

    // Forced-logout enforcement (Story 2-3 / 2-4 parity). Tokens minted
    // before the session-store rollout don't carry a jti — we let those
    // through during the transition; new tokens always carry one.
    if (payload.jti) {
      const active = await this.sessions.isActive({
        organizationId: payload.org,
        userId: payload.sub,
        jti: payload.jti,
      });
      if (!active) {
        this.logger.warn(
          {
            correlation_id: correlationId,
            op: 'ws_auth_fail',
            reason: 'session_revoked',
            user_id: payload.sub,
            organization_id: payload.org,
          },
          'WebSocket handshake rejected: session revoked',
        );
        client.disconnect(true);
        return;
      }
    }

    // Story 5-2 AC2 — populate ActorContext. The shape mirrors the
    // RequestUser/ActorContext primitive from Story 2-5 so any
    // downstream service that calls `actorFromSocket(socket)` gets
    // the same object it would get from REST via @ActorContext().
    const actor: ActorContext = actorContextFromRequestUser({
      user_id: payload.sub,
      organization_id: payload.org,
      role: payload.role,
      display_name: payload.name ?? '',
      ...(payload.jti ? { jti: payload.jti } : {}),
    });
    (client.data as { actor?: ActorContext }).actor = actor;

    this.logger.log(
      {
        correlation_id: correlationId,
        op: 'ws_connect',
        socket_id: client.id,
        user_id: actor.user_id,
        organization_id: actor.organization_id,
        role: actor.role,
      },
      'socket connected',
    );
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    const correlationId = (client.data as { correlation_id?: string }).correlation_id;
    const actor = (client.data as { actor?: ActorContext }).actor;
    this.logger.log(
      {
        correlation_id: correlationId,
        op: 'ws_disconnect',
        socket_id: client.id,
        user_id: actor?.user_id ?? null,
        organization_id: actor?.organization_id ?? null,
      },
      'socket disconnected',
    );
  }
}

/** Extract the JWT from the handshake. Returns null if neither source
 *  carries a usable token. */
function extractToken(client: Socket): string | null {
  // Preferred: handshake.auth — socket.io-client sets this via
  //   io(url, { auth: { token } })
  const authToken = (client.handshake.auth as { token?: unknown }).token;
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }
  // Fallback: Authorization header on the upgrade request. Case-
  // insensitive per RFC 6750 — mirrors the HTTP guard's behaviour.
  const header = client.handshake.headers['authorization'];
  if (
    typeof header === 'string' &&
    header.length >= 7 &&
    header.slice(0, 7).toLowerCase() === 'bearer '
  ) {
    const t = header.slice(7).trim();
    return t.length > 0 ? t : null;
  }
  return null;
}
