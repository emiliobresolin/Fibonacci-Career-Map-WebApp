import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { QUEUES, dlqOf } from './queues.config.js';

const SMOKE_QUEUE = '__smoke' as const;
const SMOKE_DLQ = dlqOf(SMOKE_QUEUE)!; // QueueDef declares dlq for __smoke, never null.

/**
 * Smoke consumer for the `__smoke` queue. Exists solely so Story 4-1's
 * AC3 has something to exercise end-to-end:
 *   - A 'noop' job succeeds → smoke test asserts completion.
 *   - A 'fail' job throws → BullMQ retries `maxAttempts` times, then the
 *     `OnWorkerEvent('failed')` handler routes the exhausted job to the
 *     `__smoke.dlq` companion queue.
 *
 * Worker options (concurrency, limiter) are passed via the `@Processor`
 * decorator's second argument — that's where BullMQ's WorkerOptions live,
 * NOT inside Queue defaultJobOptions. Without this, the Worker runs at
 * BullMQ's default concurrency: 1 with no rate-limiting regardless of what
 * `QueueDef.concurrency` declares.
 *
 * Real domain consumers (audit.outbox-relay, scoring.recalc-employee)
 * follow this same shape: a `@Processor(queueName, { concurrency, limiter })`
 * class extending `WorkerHost`, with an `OnWorkerEvent('failed')` that
 * promotes terminal failures into the queue's DLQ.
 */
@Processor(SMOKE_QUEUE, {
  concurrency: QUEUES[SMOKE_QUEUE].concurrency,
  ...(QUEUES[SMOKE_QUEUE].rateLimit ? { limiter: QUEUES[SMOKE_QUEUE].rateLimit } : {}),
})
export class SmokeConsumer extends WorkerHost {
  private readonly logger = new Logger(SmokeConsumer.name);

  constructor(@InjectQueue(SMOKE_DLQ) private readonly dlq: Queue) {
    super();
  }

  async process(job: Job<SmokePayload, SmokeResult, SmokeJobName>): Promise<SmokeResult> {
    switch (job.name) {
      case 'noop':
        return { ok: true, echo: job.data.echo ?? null };
      case 'fail':
        throw new Error(job.data.reason ?? 'smoke: intentional failure');
      default:
        throw new Error(`smoke: unknown job name ${String(job.name)}`);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<SmokePayload, SmokeResult, SmokeJobName>, err: Error): Promise<void> {
    // Non-terminal: BullMQ still has retries left; let it retry.
    if (job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }
    if (!job.id) {
      // Defensive: BullMQ assigns Job.id on Queue.add resolve. A failed
      // job without an id is unrouteable to a DLQ entry we can re-find.
      this.logger.error(`smoke job has no id; cannot route to ${SMOKE_DLQ}: ${err.message}`);
      return;
    }
    // Idempotent promotion: use a deterministic DLQ jobId derived from the
    // original job id. If the 'failed' event ever fires twice for the same
    // terminal failure (worker reconnect/replay), the second add returns
    // the existing DLQ entry rather than creating a duplicate.
    const dlqJobId = `from:${job.id}`;
    try {
      await this.dlq.add(
        job.name,
        {
          originalJobId: job.id,
          originalQueue: SMOKE_QUEUE,
          attemptsMade: job.attemptsMade,
          failureReason: err.message,
          data: job.data,
        } satisfies DlqPayload<SmokePayload>,
        { jobId: dlqJobId, attempts: 1 },
      );
    } catch (dlqErr) {
      // DLQ promotion failure (transient Redis blip) is itself a critical
      // operational signal — log loudly so the alerting layer can pick it
      // up. The original job remains in the main queue's failed-set for a
      // week (removeOnFail retention), so forensic context survives.
      this.logger.error(
        `smoke: failed to route job ${job.id} to ${SMOKE_DLQ}: ${(dlqErr as Error).message}`,
      );
    }
  }
}

export type SmokeJobName = 'noop' | 'fail';
export type SmokePayload = { echo?: string; reason?: string };
export type SmokeResult = { ok: true; echo: string | null };
export type DlqPayload<T> = {
  originalJobId: string;
  originalQueue: string;
  attemptsMade: number;
  failureReason: string;
  data: T;
};
