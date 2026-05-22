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

import type { Env } from '../common/env.config.js';
import { parseOrigins } from '../common/env.config.js';

/**
 * FCM realtime gateway (Story 5-1).
 *
 * Hosts the Socket.IO namespace `/`. Auth + room-join authorization
 * land in Stories 5-2 and 5-3; this story owns the lifecycle hooks +
 * the correlation-id stamping that ties realtime activity into the
 * existing pino structured-log pipeline.
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

  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  handleConnection(@ConnectedSocket() client: Socket): void {
    // Mirror the HTTP-side correlation-id scheme — the gateway picks
    // up X-Request-Id from the upgrade request when present, else
    // mints a fresh UUID. Every connect/disconnect/event log line
    // includes the field so cross-protocol queries in the aggregator
    // (Story 1-7) work.
    const headers = client.handshake.headers;
    const inboundId = headers['x-request-id'];
    const correlationId =
      typeof inboundId === 'string'
        ? inboundId
        : Array.isArray(inboundId)
          ? inboundId[0]!
          : randomUUID();
    (client.data as { correlation_id?: string }).correlation_id = correlationId;
    this.logger.log(
      { correlation_id: correlationId, op: 'ws_connect', socket_id: client.id },
      'socket connected',
    );
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    const correlationId = (client.data as { correlation_id?: string }).correlation_id;
    this.logger.log(
      { correlation_id: correlationId, op: 'ws_disconnect', socket_id: client.id },
      'socket disconnected',
    );
  }
}
