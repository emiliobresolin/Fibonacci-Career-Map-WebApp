import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import type { Env } from '../common/env.config.js';

/**
 * Redis-backed session store (Story 2-3 AC1 + AC2).
 *
 * Indexes active sessions by `session:<orgId>:<userId>:<jti>` so:
 *   • The auth guard can validate an inbound JWT's jti is still active.
 *   • Admin revoke can drop all of a user's sessions in one call via
 *     `SCAN MATCH session:<orgId>:<userId>:* + DEL`.
 *
 * Keys carry a TTL set to the access-token absolute expiry (24h, PRD
 * FR-1.5). Idle timeout (2h) is enforced by NextAuth's updateAge — the
 * Redis layer is purely the revocation anchor.
 *
 * Conservative connection options (`maxRetriesPerRequest: 3`,
 * `enableReadyCheck: false`) so a Redis blip surfaces as a transient
 * error rather than an unbounded hang on the guard's hot path.
 */
@Injectable()
export class SessionStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionStoreService.name);
  private redis: Redis | null = null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const url = this.config.get('REDIS_URL', { infer: true });
    if (!url) {
      // Dev/test without Redis — the store is dormant. Production env-
      // validation forbids this path.
      this.logger.warn('REDIS_URL not set — session store dormant');
      return;
    }
    this.redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    this.redis.on('error', (err) => {
      this.logger.warn(`session store connection error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // Ignore.
      }
      this.redis = null;
    }
  }

  /** Register a freshly-issued session. TTL in seconds. */
  async register(args: { organizationId: string; userId: string; jti: string; ttlSeconds: number }): Promise<void> {
    if (!this.redis) return;
    const key = this.keyFor(args.organizationId, args.userId, args.jti);
    await this.redis.set(key, '1', 'EX', args.ttlSeconds);
  }

  /** Check whether a jti is still active. Returns true when dormant
   *  (no Redis) so the auth path stays usable in dev/test — the
   *  session-store revocation guarantee is opt-in via REDIS_URL. */
  async isActive(args: { organizationId: string; userId: string; jti: string }): Promise<boolean> {
    if (!this.redis) return true;
    const key = this.keyFor(args.organizationId, args.userId, args.jti);
    const value = await this.redis.get(key);
    return value !== null;
  }

  /**
   * Drop every session for the (organizationId, userId) pair. Returns
   * the count of keys deleted so the audit event can record the size
   * of the blast radius.
   */
  async revokeAll(args: { organizationId: string; userId: string }): Promise<number> {
    if (!this.redis) return 0;
    const pattern = `session:${args.organizationId}:${args.userId}:*`;
    // SCAN-and-DEL rather than KEYS — KEYS blocks the Redis main thread
    // and is forbidden at scale. SCAN cursor-paginates with bounded
    // per-call cost.
    let cursor = '0';
    let deleted = 0;
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (batch.length > 0) {
        deleted += await this.redis.del(...batch);
      }
    } while (cursor !== '0');
    return deleted;
  }

  private keyFor(orgId: string, userId: string, jti: string): string {
    return `session:${orgId}:${userId}:${jti}`;
  }
}
