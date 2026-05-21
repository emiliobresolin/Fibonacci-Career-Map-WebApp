import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import pg from 'pg';

const { Client: PgClient } = pg;
type PgClient = InstanceType<typeof PgClient>;

import type { Env } from '../common/env.config.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Postgres LISTEN/NOTIFY pump for the outbox (Arch §9.3 / AD-7 / Story 3-3 AC1).
 *
 *   • A dedicated pg.Client connection issues `LISTEN outbox_new`.
 *   • Each NOTIFY payload is the event_id of an inserted row; the listener
 *     enqueues a `relay` job onto `audit.outbox-relay` with that event_id
 *     as the BullMQ jobId (idempotent enqueue — duplicate NOTIFYs coalesce
 *     in BullMQ before the consumer ever runs).
 *   • On startup AND on every reconnect, a catch-up scan picks up any
 *     unpublished rows that landed during the disconnect window — PG does
 *     NOT buffer notifications for absent listeners.
 *   • A periodic safety scan (60s) also fires irrespective of NOTIFY
 *     traffic, so a perfectly silent NOTIFY pipe (broken trigger, dropped
 *     connection that didn't surface as an error event) still drains the
 *     backlog within a minute.
 *   • Reconnect uses exponential backoff capped at 30s.
 *
 * Worker-mode only. The api-mode application context never imports this
 * service — `OutboxModule.register({ mode })` gates it.
 */
@Injectable()
export class OutboxListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxListenerService.name);
  private client: PgClient | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private safetyScanTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private shuttingDown = false;
  private scanInFlight = false;
  /** Set true while a connect() invocation is mid-flight. Prevents
   *  scheduleReconnect() racing the in-flight attempt and producing two
   *  parallel pg.Clients both listening on outbox_new. */
  private connecting = false;
  private static readonly CHANNEL = 'outbox_new';
  private static readonly SAFETY_SCAN_INTERVAL_MS = 60_000;
  private static readonly RECONNECT_MAX_DELAY_MS = 30_000;
  /** Batch cap so a backlog scan can't dump 100k jobs into BullMQ in one go. */
  private static readonly CATCHUP_BATCH = 500;
  /** Maximum chained continuation scans to drain a deep backlog without
   *  starving the event loop. 200 × 500 = 100k events per chain ceiling. */
  private static readonly MAX_CONTINUATION_CHAIN = 200;
  /** Strict UUID v1–v5 shape. Anything else from a malicious or corrupted
   *  NOTIFY source gets dropped at the listener boundary so it can't ever
   *  pollute BullMQ with poison jobs. */
  private static readonly UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue('audit.outbox-relay') private readonly queue: Queue,
  ) {}

  onModuleInit(): void {
    // Start the safety scan timer FIRST. If the initial connect() throws
    // synchronously (or the DB stays down indefinitely), the safety timer
    // is still active and will drain the backlog once the DB recovers.
    this.safetyScanTimer = setInterval(() => {
      this.safetyScan().catch((err) => this.logger.warn(`outbox safety scan failed: ${String(err)}`));
    }, OutboxListenerService.SAFETY_SCAN_INTERVAL_MS);
    this.safetyScanTimer.unref();
    // Fire-and-forget the initial connect: a failure here (DB unreachable
    // at boot — e.g., the api-bootstrap scaffold test points at a stub
    // hostname) must not crash the worker. The connect() method's own
    // try/catch routes failures into scheduleReconnect() which will keep
    // trying with exponential backoff.
    this.connect().catch((err) => {
      this.logger.warn(`outbox listener initial connect threw: ${(err as Error).message}`);
      this.scheduleReconnect();
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.safetyScanTimer) clearInterval(this.safetyScanTimer);
    if (this.client) {
      try {
        await this.client.end();
      } catch {
        // Already disconnected — ignore.
      }
      this.client = null;
    }
  }

  private async connect(): Promise<void> {
    if (this.shuttingDown || this.connecting) return;
    const databaseUrl = this.config.get('DATABASE_URL', { infer: true });
    if (!databaseUrl) {
      // Dev/test scaffold runs without DATABASE_URL — log once and stay
      // dormant. Production env-validation enforces DATABASE_URL elsewhere.
      this.logger.warn('DATABASE_URL not set — outbox listener dormant');
      return;
    }
    this.connecting = true;
    // Tear down any prior client (e.g., from a reconnect path where 'error'
    // already fired but the socket wasn't ended). removeAllListeners +
    // end() severs the closure so stale handlers can't enqueue against a
    // dead connection.
    const previous = this.client;
    if (previous) {
      this.client = null;
      previous.removeAllListeners();
      previous.end().catch(() => undefined);
    }
    const client = new PgClient({ connectionString: databaseUrl });
    client.on('notification', (msg) => {
      if (msg.channel !== OutboxListenerService.CHANNEL) return;
      const eventId = msg.payload;
      // Validate UUID shape at the boundary so a corrupted trigger or rogue
      // NOTIFY source can't poison BullMQ with a non-UUID jobId.
      if (!eventId || !OutboxListenerService.UUID_RE.test(eventId)) {
        this.logger.warn(`outbox NOTIFY dropped — payload is not a UUID: ${String(eventId)}`);
        return;
      }
      // Fire-and-forget enqueue with a captured catch so a transient Redis
      // error doesn't escape to the event-emitter's unhandled-rejection
      // path. The next safety scan will pick the row up again.
      this.enqueue(eventId).catch((err) => {
        this.logger.error(`outbox enqueue failed for ${eventId}: ${String(err)}`);
      });
    });
    client.on('error', (err) => {
      // ECONNRESET, idle-in-transaction kills, PG restart — all hit here.
      this.logger.warn(`outbox listener connection error: ${err.message}`);
      this.scheduleReconnect();
    });
    client.on('end', () => {
      if (!this.shuttingDown) {
        this.logger.warn('outbox listener connection ended unexpectedly');
        this.scheduleReconnect();
      }
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${OutboxListenerService.CHANNEL}`);
      this.client = client;
      this.reconnectAttempt = 0;
      this.logger.log(`outbox listener connected and listening on '${OutboxListenerService.CHANNEL}'`);
      // PG buffers nothing for absent listeners, so anything that landed
      // during the disconnect window is unannounced. Catch up immediately.
      await this.catchupScan();
    } catch (err) {
      this.logger.warn(`outbox listener initial connect failed: ${(err as Error).message}`);
      // removeAllListeners FIRST so the 'end' fired by client.end() can't
      // trigger a parallel scheduleReconnect call via the listener.
      client.removeAllListeners();
      try {
        await client.end();
      } catch {
        // Already closed — ignore.
      }
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnectTimer || this.connecting) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(
      2 ** Math.min(this.reconnectAttempt, 16) * 100,
      OutboxListenerService.RECONNECT_MAX_DELAY_MS,
    );
    // Detach and end the prior client. removeAllListeners before end() so
    // the 'end' event can't fire scheduleReconnect again from the listener.
    const previous = this.client;
    this.client = null;
    if (previous) {
      previous.removeAllListeners();
      previous.end().catch(() => undefined);
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) =>
        this.logger.warn(`outbox listener reconnect attempt threw: ${String(err)}`),
      );
    }, delay);
    this.reconnectTimer.unref();
  }

  private async catchupScan(chainDepth = 0): Promise<void> {
    // In-flight mutex: skip if another scan is already draining. The next
    // scheduled scan will pick up where this one is currently working.
    if (this.scanInFlight) return;
    this.scanInFlight = true;
    try {
      const rows = await this.prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: OutboxListenerService.CATCHUP_BATCH,
        select: { eventId: true },
      });
      for (const row of rows) {
        if (this.shuttingDown) break;
        try {
          await this.enqueue(row.eventId);
        } catch (err) {
          // A transient Redis blip on a single row must not abort the
          // remaining batch — the next safety scan would retry, but the
          // current scan should still drain what it can.
          this.logger.warn(`outbox enqueue failed for ${row.eventId}: ${(err as Error).message}`);
        }
      }
      if (
        rows.length === OutboxListenerService.CATCHUP_BATCH &&
        chainDepth < OutboxListenerService.MAX_CONTINUATION_CHAIN &&
        !this.shuttingDown
      ) {
        // Backlog deeper than the batch cap — schedule another scan so the
        // listener doesn't wait 60s for the safety timer. The chain-depth
        // cap prevents an unbounded recursive drain from starving the
        // event loop on pathologically large backlogs.
        setImmediate(() => {
          this.catchupScan(chainDepth + 1).catch((err) =>
            this.logger.warn(`outbox catch-up continuation failed: ${String(err)}`),
          );
        });
      }
    } finally {
      this.scanInFlight = false;
    }
  }

  private async safetyScan(): Promise<void> {
    if (this.shuttingDown) return;
    await this.catchupScan();
  }

  /** Idempotent enqueue: jobId === eventId means duplicate NOTIFYs (or
   *  catchup re-discoveries) coalesce into a single BullMQ job. */
  private async enqueue(eventId: string): Promise<void> {
    await this.queue.add('relay', { eventId }, { jobId: eventId });
  }
}
