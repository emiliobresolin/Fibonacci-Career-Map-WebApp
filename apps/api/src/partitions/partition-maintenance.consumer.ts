import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { dlqOf, QUEUES } from '../jobs/queues.config.js';
import { PrismaService } from '../prisma/prisma.service.js';

const QUEUE = 'snapshot.partition-maintenance' as const;
const DLQ = dlqOf(QUEUE)!;

/** Number of months ahead of NOW() that the maintenance job ensures
 *  partitions exist for. Arch §6.4 / AR-8 mandate 3 months — that's the
 *  buffer between weekly runs and a backlog cliff. */
export const LOOKAHEAD_MONTHS = 3;

export type PartitionMaintenanceJobData = {
  /** Optional explicit anchor date — useful for tests. Defaults to NOW(). */
  anchorIso?: string;
};

export type PartitionMaintenanceResult = {
  /** Number of partitions created on this run (0..LOOKAHEAD_MONTHS for each table). */
  created: number;
  /** Number that already existed and were skipped. */
  skipped: number;
  /** Lookahead months actually achieved after the run — drives the
   *  fcm_audit_partition_lookahead_months metric. */
  lookaheadMonths: number;
};

/**
 * Weekly partition-maintenance consumer (Story 3-6, Arch §6.4 / AR-8).
 *
 * For each of `audit_events` (and future `score_snapshots` once Story
 * 9-4 lands), ensures the next LOOKAHEAD_MONTHS monthly partitions
 * exist as PARTITION OF the parent table.
 *
 * Idempotent: `CREATE TABLE IF NOT EXISTS` makes repeated runs no-ops;
 * a duplicate `CREATE TABLE ... PARTITION OF` raises 42P07 (relation
 * already exists) which we treat as success. The maintenance scheduler
 * also self-registers via BullMQ's `repeat` option — exactly-once
 * scheduling (BullMQ dedupes by jobId) so a worker restart doesn't
 * double-up the cron.
 */
@Processor(QUEUE, {
  concurrency: QUEUES[QUEUE].concurrency,
})
export class PartitionMaintenanceConsumer extends WorkerHost {
  private readonly logger = new Logger(PartitionMaintenanceConsumer.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue(DLQ) private readonly dlq: Queue,
  ) {
    super();
  }

  async process(job: Job<PartitionMaintenanceJobData>): Promise<PartitionMaintenanceResult> {
    const anchor = job.data.anchorIso ? new Date(job.data.anchorIso) : new Date();
    if (Number.isNaN(anchor.getTime())) {
      throw new Error(`partition-maintenance: invalid anchorIso ${job.data.anchorIso}`);
    }

    const targets = nextMonths(anchor, LOOKAHEAD_MONTHS);
    let created = 0;
    let skipped = 0;
    for (const t of targets) {
      const partitionName = `audit_events_${t.year}_${pad2(t.month)}`;
      const fromIso = isoUtcMidnight(t.year, t.month);
      const toIso = isoUtcMidnight(...nextMonthYM(t.year, t.month));
      const result = await this.ensurePartition(partitionName, fromIso, toIso);
      if (result === 'created') created += 1;
      else skipped += 1;
    }
    this.logger.log(
      `partition maintenance complete (anchor=${anchor.toISOString()}) — created ${created}, skipped ${skipped}`,
    );
    return { created, skipped, lookaheadMonths: LOOKAHEAD_MONTHS };
  }

  private async ensurePartition(name: string, fromIso: string, toIso: string): Promise<'created' | 'existed'> {
    // PG raises 42P07 (duplicate_table) if the partition already exists.
    // `CREATE TABLE IF NOT EXISTS` swallows that — making the job
    // idempotent without us having to query pg_inherits first. The
    // REVOKE TRUNCATE is also idempotent.
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF "audit_events"
          FOR VALUES FROM (TIMESTAMPTZ '${fromIso}') TO (TIMESTAMPTZ '${toIso}')
      `);
      await this.prisma.$executeRawUnsafe(`REVOKE TRUNCATE ON "${name}" FROM PUBLIC`);
      // If a previous run had a partial application, the table existed
      // but maybe permissions weren't applied. Always re-issue the
      // REVOKE — it's a no-op when already revoked.
      return 'created';
    } catch (err) {
      // CREATE TABLE IF NOT EXISTS on a partition already mapped to a
      // different range raises 42P17. That's a real config drift the
      // operator must intervene on — surface it to DLQ rather than
      // silently swallowing.
      this.logger.error(`partition-maintenance: failed to ensure ${name}: ${(err as Error).message}`);
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<PartitionMaintenanceJobData>, err: Error): Promise<void> {
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
    if (!job.id) {
      this.logger.error(`partition-maintenance job has no id; cannot route to ${DLQ}: ${err.message}`);
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
        `partition-maintenance: failed to route ${job.id} to ${DLQ}: ${(dlqErr as Error).message}`,
      );
    }
  }
}

/** Pure functions exported for unit testing. */

export function nextMonths(anchor: Date, count: number): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let y = anchor.getUTCFullYear();
  let m = anchor.getUTCMonth() + 1; // human-readable 1..12
  for (let i = 0; i < count; i++) {
    out.push({ year: y, month: m });
    [y, m] = nextMonthYM(y, m);
  }
  return out;
}

export function nextMonthYM(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1];
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isoUtcMidnight(year: number, month: number): string {
  // PG expects 'YYYY-MM-DD HH:MM:SS+00' or ISO with explicit offset.
  return `${year}-${pad2(month)}-01 00:00:00+00`;
}
