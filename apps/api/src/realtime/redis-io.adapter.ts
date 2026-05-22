import { createAdapter } from '@socket.io/redis-adapter';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Redis-adapter-backed Socket.IO server (Story 5-1, Arch §8.1 + §8.4).
 *
 * The vanilla Nest `IoAdapter` only fans out within a single process.
 * For horizontally-scaled API replicas, an emit on replica A must
 * reach a client connected to replica B — that's the
 * `@socket.io/redis-adapter` plus a pair of pub/sub Redis connections.
 *
 * Two connections (`pub` + `sub`) are required because ioredis enters
 * subscriber mode on the subscribing connection and refuses regular
 * commands afterwards. Sharing the BullMQ connection is unsafe (it's
 * already in subscriber mode on the queue channels). Both connections
 * are created here, scoped to this adapter's lifecycle.
 *
 * `connectionStateRecovery` is OFF — sessions are stateless JWTs,
 * reconnects produce a fresh handshake. Saving a "stub" connection
 * after a disconnect would let a revoked token continue to receive
 * events for up to 2 minutes, defeating the Story 2-3 forced-logout
 * guarantee.
 *
 * The pub/sub channel prefix is `fcm-io:` so the FCM Socket.IO
 * channels never collide with the audit-relay fanout channel
 * (`fcm.realtime`, set in apps/api/src/outbox/outbox-relay.consumer.ts)
 * even on a shared Redis.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(redisUrl: string): Promise<void> {
    this.pubClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    this.subClient = this.pubClient.duplicate();
    this.pubClient.on('error', (err) => {
      this.logger.warn(`socket.io redis pub error: ${err.message}`);
    });
    this.subClient.on('error', (err) => {
      this.logger.warn(`socket.io redis sub error: ${err.message}`);
    });
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient, {
      key: 'fcm-io',
    });
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      // Sessions are stateless JWTs — disable connection recovery so a
      // revoked token cannot reattach to an in-flight session id.
      connectionStateRecovery: undefined,
      // Socket.IO 4.x default `transports` is ['polling', 'websocket'].
      // Polling is a fallback for ancient browsers; the FCM web client
      // targets modern Chromium/Firefox/Safari so we can prefer WS first.
      transports: ['websocket', 'polling'],
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    } else {
      this.logger.warn(
        'Redis adapter not configured — Socket.IO will run single-replica only. Call connectToRedis(...) before listen().',
      );
    }
    return server;
  }

  override async dispose(): Promise<void> {
    if (this.pubClient) {
      try {
        await this.pubClient.quit();
      } catch {
        // ignore
      }
      this.pubClient = null;
    }
    if (this.subClient) {
      try {
        await this.subClient.quit();
      } catch {
        // ignore
      }
      this.subClient = null;
    }
  }
}
