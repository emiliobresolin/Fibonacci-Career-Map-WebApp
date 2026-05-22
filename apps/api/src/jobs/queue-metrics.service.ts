import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Gauge, Histogram } from 'prom-client';

import { MetricsService } from '../observability/metrics.service.js';
import { ACTIVE_QUEUES, dlqOf, type QueueName } from './queues.config.js';

/**
 * Per-queue Prometheus metrics (Story 4-2 AC3 / Arch §11.4).
 *
 * Three series per active queue:
 *
 *   • `fcm_queue_depth{queue}` — waiting + active jobs (the backlog
 *     the on-call dashboard watches).
 *   • `fcm_queue_dlq_depth{queue}` — failed-past-max-attempts jobs in
 *     the queue's `.dlq` companion. Queues with `dlq: null` (e.g.
 *     observability.client-metrics) emit `0` here.
 *   • `fcm_queue_processing_duration_seconds{queue,outcome}` — histogram
 *     of per-job processing duration, labeled by outcome (success /
 *     failure). Consumer code calls `recordDuration(...)` from its
 *     `OnWorkerEvent('completed' | 'failed')` hooks to populate this.
 *
 * Depth + DLQ-depth are sampled every 15s — same cadence as the outbox
 * depth gauge (Story 3-3) so an operator dashboard renders all backlog
 * signals at the same time resolution.
 *
 * The service is registered in worker mode AND api mode: api-mode
 * exposes /metrics via the existing MetricsController, and the queue
 * counts come straight from Redis (no DB hit), so observability is
 * uniform regardless of which process the scraper targets.
 */
@Injectable()
export class QueueMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsService.name);
  private depthGauge: Gauge<'queue'> | null = null;
  private dlqDepthGauge: Gauge<'queue'> | null = null;
  private durationHistogram: Histogram<'queue' | 'outcome'> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private sampling = false;
  private static readonly SAMPLE_INTERVAL_MS = 15_000;

  // Inject every active queue + its DLQ. BullMQ's @InjectQueue resolves
  // the registered Queue instance; the JobsModule registration in
  // jobs.module.ts ensures these exist whenever this service is loaded.
  constructor(
    @Inject(MetricsService) private readonly metrics: MetricsService,
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
    @InjectQueue('observability.client-metrics') private readonly qObs: Queue,
    // observability.client-metrics has dlq: null, so no DLQ injection.
  ) {}

  onModuleInit(): void {
    this.depthGauge = new Gauge({
      name: 'fcm_queue_depth',
      help: 'Waiting + active BullMQ jobs per queue. Sampled every 15s.',
      labelNames: ['queue'],
      registers: [this.metrics.registry],
    });
    this.dlqDepthGauge = new Gauge({
      name: 'fcm_queue_dlq_depth',
      help: 'Jobs sitting in the queue\'s DLQ companion. Should normally be 0.',
      labelNames: ['queue'],
      registers: [this.metrics.registry],
    });
    this.durationHistogram = new Histogram({
      name: 'fcm_queue_processing_duration_seconds',
      help: 'Per-job processing duration in seconds, labeled by outcome.',
      labelNames: ['queue', 'outcome'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 30, 120],
      registers: [this.metrics.registry],
    });
    // Pre-stamp every active queue at 0 so the gauge appears in the
    // first scrape, even before the async sample resolves.
    for (const q of ACTIVE_QUEUES) {
      this.depthGauge.set({ queue: q }, 0);
      if (dlqOf(q) !== null) this.dlqDepthGauge.set({ queue: q }, 0);
    }
    void this.sample();
    this.timer = setInterval(() => {
      void this.sample();
    }, QueueMetricsService.SAMPLE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Record a job's processing duration. Consumers call this from their
   *  OnWorkerEvent('completed') and OnWorkerEvent('failed') hooks. */
  recordDuration(queue: QueueName, outcome: 'success' | 'failure', durationSeconds: number): void {
    if (!this.durationHistogram) return;
    this.durationHistogram.labels({ queue, outcome }).observe(durationSeconds);
  }

  private async sample(): Promise<void> {
    if (!this.depthGauge || !this.dlqDepthGauge) return;
    if (this.sampling) return;
    this.sampling = true;
    try {
      const pairs: Array<{ name: QueueName; main: Queue; dlq: Queue | null }> = [
        { name: '__smoke', main: this.qSmoke, dlq: this.dlqSmoke },
        { name: 'audit.outbox-relay', main: this.qOutbox, dlq: this.dlqOutbox },
        { name: 'scoring.recalc-employee', main: this.qScoreEmp, dlq: this.dlqScoreEmp },
        { name: 'scoring.recalc-org-bulk', main: this.qScoreBulk, dlq: this.dlqScoreBulk },
        { name: 'evidence.expiry-scan', main: this.qEvidExp, dlq: this.dlqEvidExp },
        { name: 'snapshot.partition-maintenance', main: this.qPartMaint, dlq: this.dlqPartMaint },
        { name: 'notification.deliver', main: this.qNotif, dlq: this.dlqNotif },
        { name: 'observability.client-metrics', main: this.qObs, dlq: null },
      ];
      await Promise.all(
        pairs.map(async ({ name, main, dlq }) => {
          try {
            const counts = await main.getJobCounts('waiting', 'active');
            const depth = (counts.waiting ?? 0) + (counts.active ?? 0);
            this.depthGauge!.set({ queue: name }, depth);
            if (dlq) {
              const dlqCounts = await dlq.getJobCounts('waiting', 'active');
              const dlqDepth = (dlqCounts.waiting ?? 0) + (dlqCounts.active ?? 0);
              this.dlqDepthGauge!.set({ queue: name }, dlqDepth);
            }
          } catch (err) {
            // Transient Redis blip: don't propagate — leave the previous
            // gauge value in place. Resetting to 0 would lie about depth.
            this.logger.warn(`${name} depth sample failed: ${(err as Error).message}`);
          }
        }),
      );
    } finally {
      this.sampling = false;
    }
  }
}
