import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { dlqOf, type QueueName } from './queues.config.js';

/**
 * DLQ admin service (Story 4-5).
 *
 * Inspect + re-enqueue the dead-letter queue for any of the architecture-
 * listed queues. Operations:
 *
 *   • `list()` — per-queue depth + a sample of the most recent N failed
 *     jobs with their failure reasons.
 *   • `replay(queueName, jobId)` — pulls a failed job from the DLQ,
 *     re-adds it to the main queue with a fresh jobId, then removes
 *     the DLQ entry. Audit emission is the controller's job.
 *
 * Queues with `dlq: null` (e.g. observability.client-metrics) are
 * excluded from the surface — they have no DLQ to admin.
 */
@Injectable()
export class DlqAdminService {
  private readonly logger = new Logger(DlqAdminService.name);

  // The pair-list mirrors QueueMetricsService — every active queue
  // whose dlq is non-null is represented here. The injection tokens
  // are resolved by BullModule.registerQueueAsync in jobs.module.ts.
  constructor(
    @InjectQueue('__smoke') private readonly qSmoke: Queue,
    @InjectQueue('__smoke.dlq') private readonly dlqSmoke: Queue,
    @InjectQueue('audit.outbox-relay') private readonly qOutbox: Queue,
    @InjectQueue('audit.outbox-relay.dlq') private readonly dlqOutbox: Queue,
    @InjectQueue('scoring.recalc-employee') private readonly qScoreEmp: Queue,
    @InjectQueue('scoring.recalc-employee.dlq') private readonly dlqScoreEmp: Queue,
    @InjectQueue('scoring.recalc-org-bulk') private readonly qScoreBulk: Queue,
    @InjectQueue('scoring.recalc-org-bulk.dlq') private readonly dlqScoreBulk: Queue,
    @InjectQueue('evidence.expiry-scan') private readonly qEvidExp: Queue,
    @InjectQueue('evidence.expiry-scan.dlq') private readonly dlqEvidExp: Queue,
    @InjectQueue('snapshot.partition-maintenance') private readonly qPartMaint: Queue,
    @InjectQueue('snapshot.partition-maintenance.dlq') private readonly dlqPartMaint: Queue,
    @InjectQueue('notification.deliver') private readonly qNotif: Queue,
    @InjectQueue('notification.deliver.dlq') private readonly dlqNotif: Queue,
  ) {}

  private dlqPair(queueName: QueueName): { main: Queue; dlq: Queue | null; dlqName: string | null } {
    switch (queueName) {
      case '__smoke':
        return { main: this.qSmoke, dlq: this.dlqSmoke, dlqName: '__smoke.dlq' };
      case 'audit.outbox-relay':
        return { main: this.qOutbox, dlq: this.dlqOutbox, dlqName: 'audit.outbox-relay.dlq' };
      case 'scoring.recalc-employee':
        return {
          main: this.qScoreEmp,
          dlq: this.dlqScoreEmp,
          dlqName: 'scoring.recalc-employee.dlq',
        };
      case 'scoring.recalc-org-bulk':
        return {
          main: this.qScoreBulk,
          dlq: this.dlqScoreBulk,
          dlqName: 'scoring.recalc-org-bulk.dlq',
        };
      case 'evidence.expiry-scan':
        return { main: this.qEvidExp, dlq: this.dlqEvidExp, dlqName: 'evidence.expiry-scan.dlq' };
      case 'snapshot.partition-maintenance':
        return {
          main: this.qPartMaint,
          dlq: this.dlqPartMaint,
          dlqName: 'snapshot.partition-maintenance.dlq',
        };
      case 'notification.deliver':
        return { main: this.qNotif, dlq: this.dlqNotif, dlqName: 'notification.deliver.dlq' };
      case 'observability.client-metrics':
        // Best-effort telemetry queue — no DLQ.
        return { main: this.qNotif /* unused */, dlq: null, dlqName: null };
    }
  }

  async list(limit = 20): Promise<DlqListResponse> {
    const queueNames: QueueName[] = [
      '__smoke',
      'audit.outbox-relay',
      'scoring.recalc-employee',
      'scoring.recalc-org-bulk',
      'evidence.expiry-scan',
      'snapshot.partition-maintenance',
      'notification.deliver',
    ];
    const entries = await Promise.all(
      queueNames.map(async (q) => {
        const { dlq } = this.dlqPair(q);
        if (!dlq) {
          return { queue: q, depth: 0, recentFailures: [] };
        }
        const counts = await dlq.getJobCounts('waiting', 'active');
        const depth = (counts.waiting ?? 0) + (counts.active ?? 0);
        // BullMQ returns Job[] from getJobs; we slice to `limit` so a
        // pathologically deep DLQ doesn't dump every entry over the wire.
        const jobs = await dlq.getJobs(['waiting', 'active'], 0, Math.max(limit - 1, 0));
        const recentFailures: DlqFailure[] = jobs.slice(0, limit).map((j) => ({
          jobId: j.id ?? '',
          name: j.name,
          originalQueue: (j.data as { originalQueue?: string })?.originalQueue ?? q,
          attemptsMade: (j.data as { attemptsMade?: number })?.attemptsMade ?? 0,
          failureReason: (j.data as { failureReason?: string })?.failureReason ?? '',
          enqueuedAt: j.timestamp ? new Date(j.timestamp).toISOString() : null,
        }));
        return { queue: q, depth, recentFailures };
      }),
    );
    return { queues: entries };
  }

  /**
   * Re-enqueue a failed job onto its original queue. The DLQ entry's
   * `data` field carries `originalJobId` / `originalQueue` / `data`
   * (the original payload) — we add that payload back onto the main
   * queue with a fresh jobId derived from the original (`replay:<id>`)
   * to keep traceability.
   *
   * Returns the new jobId. Throws if the DLQ entry doesn't exist or
   * lacks the documented `data` envelope.
   */
  async replay(queueName: QueueName, dlqJobId: string): Promise<{ newJobId: string }> {
    const { main, dlq } = this.dlqPair(queueName);
    if (!dlq) {
      throw new Error(`Queue '${queueName}' has no DLQ`);
    }
    const job = await dlq.getJob(dlqJobId);
    if (!job) {
      throw new Error(`DLQ job '${dlqJobId}' not found on ${queueName}.dlq`);
    }
    const envelope = job.data as {
      originalJobId?: string;
      originalQueue?: string;
      data?: unknown;
      failureReason?: string;
    };
    if (!envelope.data) {
      throw new Error(`DLQ job '${dlqJobId}' has no original data payload — cannot replay`);
    }
    const newJobId = `replay:${envelope.originalJobId ?? dlqJobId}:${Date.now()}`;
    await main.add(job.name, envelope.data, { jobId: newJobId });
    // Remove the DLQ entry only after the main-queue add succeeds so
    // a crash between the two leaves the entry available for retry.
    await job.remove();
    this.logger.log(
      {
        op: 'dlq_replay',
        queue: queueName,
        originalJobId: envelope.originalJobId,
        newJobId,
      },
      'DLQ job replayed',
    );
    return { newJobId };
  }
}

export type DlqFailure = {
  jobId: string;
  name: string;
  originalQueue: string;
  attemptsMade: number;
  failureReason: string;
  enqueuedAt: string | null;
};

export type DlqQueueEntry = {
  queue: QueueName;
  depth: number;
  recentFailures: DlqFailure[];
};

export type DlqListResponse = {
  queues: DlqQueueEntry[];
};
