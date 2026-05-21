import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeParseAuditEvent } from '@fcm/domain-contracts';
import { Prisma } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';

import type { Env } from '../common/env.config.js';
import { dlqOf, QUEUES, type QueueName } from '../jobs/queues.config.js';
import { PrismaService } from '../prisma/prisma.service.js';

const QUEUE = 'audit.outbox-relay' as const;
const DLQ = dlqOf(QUEUE)!;
/** Redis pub/sub channel the future Socket.IO server (Story 5-1) subscribes
 *  to for realtime fanout. No subscriber today — the contract is documented
 *  here so 5-1 lands cleanly. */
const REALTIME_CHANNEL = 'fcm.realtime';
/** Strict UUID v1–v5 shape — guards every code path that interpolates the
 *  eventId into raw SQL (`::uuid` would throw cryptically on a malformed
 *  string). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Generous transaction budget — the relay write is two simple statements
 *  but contention on a hot partition or a contended outbox row can push
 *  past Prisma's 5s default. */
const TX_TIMEOUT_MS = 30_000;

export type OutboxRelayJobData = { eventId: string };

/** Shape of an outbox payload's optional `downstreamJobs` slot. */
type DownstreamJob = { queue: QueueName; name: string; data: unknown };
type OutboxPayload = { downstreamJobs?: DownstreamJob[] } & Record<string, unknown>;

/**
 * Outbox relay consumer (Arch §9.3 / AD-7 / Story 3-3 AC2 + AC3 + AC4).
 *
 * Per-job flow:
 *   1. `SELECT ... FOR UPDATE` on the outbox row inside a Prisma
 *      `$transaction`. This serializes any two workers that pull the same
 *      eventId via different jobIds — without the row lock, both would see
 *      `publishedAt === null`, both would proceed, and both would publish
 *      duplicate realtime events and downstream jobs.
 *   2. If `publishedAt !== null`, skip — idempotency layer 1 (already
 *      processed).
 *   3. INSERT audit_events using `event.eventId` as the id and
 *      `event.createdAt` as occurred_at. Both halves of the composite
 *      (id, occurred_at) PK are stable across retries, so a duplicate
 *      INSERT raises P2002 — idempotency layer 2 (survives a partial-
 *      success crash between audit INSERT and outbox UPDATE in a prior
 *      attempt).
 *   4. UPDATE outbox_events SET published_at = NOW(). Holds the row lock
 *      until commit.
 *   5. After commit: publish realtime fanout + enqueue downstream jobs.
 *      These run outside the transaction and are at-least-once; the
 *      durable record (audit_events) is what backs auditability.
 */
@Processor(QUEUE, {
  concurrency: QUEUES[QUEUE].concurrency,
  ...(QUEUES[QUEUE].rateLimit ? { limiter: QUEUES[QUEUE].rateLimit } : {}),
})
export class OutboxRelayConsumer extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayConsumer.name);
  private readonly publisher: Redis | null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue(DLQ) private readonly dlq: Queue,
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService<Env, true>,
  ) {
    super();
    // Dedicated Redis publisher for the realtime channel. Sharing the
    // BullMQ ioredis connection is unsafe — that connection is in
    // subscriber/blocking mode for the queue.
    const redisUrl = this.config?.get('REDIS_URL', { infer: true });
    if (redisUrl) {
      const publisher = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        lazyConnect: false,
      });
      publisher.on('error', (err) => {
        this.logger.warn(`realtime publisher connection error: ${err.message}`);
      });
      this.publisher = publisher;
    } else {
      this.publisher = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.publisher) {
      try {
        await this.publisher.quit();
      } catch {
        // Already disconnected or transient error — ignore on shutdown.
      }
    }
  }

  async process(job: Job<OutboxRelayJobData>): Promise<void> {
    const { eventId } = job.data;
    if (!eventId || typeof eventId !== 'string' || !UUID_RE.test(eventId)) {
      throw new Error('outbox-relay: job.data.eventId is required and must be a UUID');
    }

    const committed = await this.prisma.$transaction(
      async (tx) => {
        // SELECT FOR UPDATE — serializes two workers racing on the same
        // eventId via different jobIds. Without this, both would pass the
        // publishedAt check and both would publish realtime/downstream.
        // queryRawUnsafe is safe here: the value comes from UUID_RE-
        // validated input above, AND we're using parameterized binding.
        const locked = await tx.$queryRaw<
          Array<{ event_id: string; organization_id: string; aggregate_type: string; aggregate_id: string; event_type: string; payload: Prisma.JsonValue; created_at: Date; published_at: Date | null }>
        >`
          SELECT "event_id", "organization_id", "aggregate_type", "aggregate_id",
                 "event_type", "payload", "created_at", "published_at"
            FROM "outbox_events"
           WHERE "event_id" = ${eventId}::uuid
           FOR UPDATE
        `;
        const row = locked[0];
        if (!row) {
          this.logger.warn(`outbox row ${eventId} not found at relay time`);
          return null;
        }
        if (row.published_at !== null) {
          return null; // idempotency layer 1 (already published)
        }

        // AC3 of Story 3-4: validate the payload against the
        // discriminated-union schema before persisting. A malformed
        // event_type/payload fails fast and routes to DLQ rather than
        // landing in audit_events with a shape no consumer can read.
        const candidate = {
          eventId: row.event_id,
          occurredAt: row.created_at.toISOString(),
          actorId: null,
          organizationId: row.organization_id,
          entityType: row.aggregate_type,
          entityId: row.aggregate_id,
          eventType: row.event_type,
          ...(typeof row.payload === 'object' && row.payload !== null && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {}),
        };
        const parsed = safeParseAuditEvent(candidate);
        if (!parsed.ok) {
          // Throwing here aborts the transaction → outbox row stays
          // unpublished → BullMQ retries → after maxAttempts the job
          // lands in DLQ with the validation error captured. That's the
          // correct outcome for a poison event.
          throw new Error(
            `outbox-relay: payload schema validation failed for ${row.event_id} (eventType=${row.event_type}): ${parsed.error.message}`,
          );
        }

        try {
          await tx.$executeRaw`
            INSERT INTO "audit_events"
              ("id", "organization_id", "actor_id", "event_type", "entity_type", "entity_id", "before", "after", "occurred_at")
            VALUES (
              ${row.event_id}::uuid,
              ${row.organization_id}::uuid,
              NULL,
              ${row.event_type},
              ${row.aggregate_type},
              ${row.aggregate_id}::uuid,
              NULL,
              ${row.payload}::jsonb,
              ${row.created_at}::timestamptz
            )
          `;
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            // Idempotency layer 2: audit row already exists (composite PK
            // collision). A prior attempt committed the audit INSERT but
            // crashed before the outbox UPDATE; we re-converge by
            // finalizing the outbox state.
            this.logger.warn(`audit_events row for ${eventId} already exists; finalizing outbox update`);
          } else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
            // Partition-routing error: occurred_at is outside every named
            // partition's range AND no DEFAULT partition exists. Story 3-1
            // ships a DEFAULT partition, so this path is mostly defensive,
            // but a future operator-driven retention sweep could remove it.
            // Surface a clear error for the operator runbook.
            this.logger.error(
              `outbox-relay: audit INSERT for ${eventId} failed (occurred_at=${row.created_at.toISOString()}); likely a missing audit_events partition. Underlying: ${(err as Error).message}`,
            );
            throw err;
          } else {
            throw err;
          }
        }

        await tx.$executeRaw`
          UPDATE "outbox_events"
             SET "published_at" = NOW()
           WHERE "event_id" = ${eventId}::uuid
        `;
        return row;
      },
      { timeout: TX_TIMEOUT_MS },
    );

    if (!committed) {
      return;
    }

    const payload = isOutboxPayload(committed.payload) ? committed.payload : {};

    await this.publishRealtime({
      eventId: committed.event_id,
      organizationId: committed.organization_id,
      aggregateType: committed.aggregate_type,
      aggregateId: committed.aggregate_id,
      eventType: committed.event_type,
      occurredAt: committed.created_at.toISOString(),
      payload,
    });

    if (Array.isArray(payload.downstreamJobs)) {
      for (const dj of payload.downstreamJobs) {
        if (!isDownstreamJob(dj)) {
          this.logger.warn(`outbox ${committed.event_id}: malformed downstreamJob entry — skipping`);
          continue;
        }
        await this.enqueueDownstream(dj, committed.event_id).catch((err) => {
          // Don't fail the whole relay job over a downstream enqueue blip;
          // the audit row is already committed. The DLQ-depth metric on
          // the downstream queue is the operator signal here.
          this.logger.warn(
            `outbox ${committed.event_id}: downstream enqueue to ${dj.queue} failed: ${(err as Error).message}`,
          );
        });
      }
    }

    this.logger.debug(`relayed outbox event ${committed.event_id}`);
  }

  private async publishRealtime(message: unknown): Promise<void> {
    if (!this.publisher) return;
    try {
      await this.publisher.publish(REALTIME_CHANNEL, JSON.stringify(message));
    } catch (err) {
      this.logger.warn(`realtime publish failed: ${(err as Error).message}`);
    }
  }

  private async enqueueDownstream(dj: DownstreamJob, originatingEventId: string): Promise<void> {
    // Concrete enqueue lights up alongside Story 4-3 (idempotency registry +
    // recalc jobs). The contract is shipped now: producers declare
    // payload.downstreamJobs[]; the relay records the intent. Without an
    // explicit queue injection per target name, this is a deliberate
    // half-step rather than dead code.
    this.logger.debug(
      `outbox ${originatingEventId}: downstream job declared { queue:${dj.queue} name:${dj.name} } — concrete enqueue arrives with Story 4-3`,
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<OutboxRelayJobData>, err: Error): Promise<void> {
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
    if (!job.id) {
      this.logger.error(`outbox-relay job has no id; cannot route to ${DLQ}: ${err.message}`);
      return;
    }
    const dlqJobId = `from:${job.id}`;
    try {
      await this.dlq.add(
        job.name,
        {
          originalJobId: job.id,
          originalQueue: QUEUE,
          attemptsMade: job.attemptsMade,
          failureReason: err.message,
          data: job.data,
        },
        { jobId: dlqJobId, attempts: 1 },
      );
    } catch (dlqErr) {
      this.logger.error(
        `outbox-relay: failed to route ${job.id} to ${DLQ}: ${(dlqErr as Error).message}`,
      );
    }
  }
}

function isOutboxPayload(raw: unknown): raw is OutboxPayload {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

function isDownstreamJob(raw: unknown): raw is DownstreamJob {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r['queue'] === 'string' && typeof r['name'] === 'string';
}
