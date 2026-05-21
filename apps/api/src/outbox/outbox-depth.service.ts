import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Gauge } from 'prom-client';

import { MetricsService } from '../observability/metrics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Emits `fcm_outbox_relay_depth` (Arch §11.4 / Story 3-3 AC4).
 *
 * The gauge counts unpublished outbox rows. EPIC-16 wires the actual alert
 * rule (depth > 0 for > 5 minutes → page); this story owns the metric
 * surface so the alert has something to fire against.
 *
 * Sampled every 15s. The COUNT query uses the partial index from Story 3-2
 * (`outbox_events_unpublished_idx`) so the cost is bounded to the size of
 * the unpublished set, not the cumulative table.
 */
@Injectable()
export class OutboxDepthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDepthService.name);
  private gauge: Gauge<string> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private sampling = false;
  private static readonly SAMPLE_INTERVAL_MS = 15_000;

  constructor(
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.gauge = new Gauge({
      name: 'fcm_outbox_relay_depth',
      help: 'Unpublished outbox_events rows (relay backlog). Alert at depth > 0 for > 5 minutes (EPIC-16).',
      registers: [this.metrics.registry],
    });
    // Set an initial observation so the gauge appears in the very first
    // Prometheus scrape, even if the async sample() hasn't resolved yet.
    // The async sample() then overwrites this with the real count.
    this.gauge.set(0);
    void this.sample();
    this.timer = setInterval(() => {
      void this.sample();
    }, OutboxDepthService.SAMPLE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sample(): Promise<void> {
    if (!this.gauge) return;
    // In-flight mutex: a slow COUNT under heavy backlog could take longer
    // than the 15s interval and stack samplers. Skip a tick rather than
    // queueing — the gauge resolution is "every-ish 15s", not "exactly".
    if (this.sampling) return;
    this.sampling = true;
    try {
      const depth = await this.prisma.outboxEvent.count({ where: { publishedAt: null } });
      this.gauge.set(depth);
    } catch (err) {
      // Don't crash the worker if the DB is briefly unavailable — the
      // listener has its own reconnect path. Reset to 0 would lie about
      // depth, so we leave the previous value in place.
      this.logger.warn(`outbox depth sample failed: ${(err as Error).message}`);
    } finally {
      this.sampling = false;
    }
  }
}
