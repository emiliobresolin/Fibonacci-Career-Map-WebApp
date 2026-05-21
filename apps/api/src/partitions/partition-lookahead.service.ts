import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Gauge } from 'prom-client';

import { MetricsService } from '../observability/metrics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LOOKAHEAD_MONTHS, nextMonths } from './partition-maintenance.consumer.js';

/**
 * Emits `fcm_audit_partition_lookahead_months` (Story 3-6 AC3) — the
 * number of consecutive months from NOW() forward that have a named
 * `audit_events_YYYY_MM` partition. EPIC-16 will alert when the
 * lookahead drops below 1 (= the cron is broken or didn't run; we are
 * close to the partition cliff).
 *
 * Sampled every 5 minutes — partition existence changes only on cron
 * runs, so the high-frequency sampling that the relay-depth gauge
 * needs would be wasteful here.
 */
@Injectable()
export class PartitionLookaheadService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PartitionLookaheadService.name);
  private gauge: Gauge<string> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private sampling = false;
  private static readonly SAMPLE_INTERVAL_MS = 5 * 60_000;

  constructor(
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.gauge = new Gauge({
      name: 'fcm_audit_partition_lookahead_months',
      help: 'Number of consecutive months from now() forward with an audit_events partition declared. Alert when < 1 (EPIC-16).',
      registers: [this.metrics.registry],
    });
    this.gauge.set(0);
    void this.sample();
    this.timer = setInterval(() => {
      void this.sample();
    }, PartitionLookaheadService.SAMPLE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sample(): Promise<void> {
    if (!this.gauge || this.sampling) return;
    this.sampling = true;
    try {
      const now = new Date();
      // Probe up to 2*LOOKAHEAD_MONTHS so we can see if the cron is
      // running ahead of schedule (a healthy signal).
      const candidates = nextMonths(now, LOOKAHEAD_MONTHS * 2);
      const names = candidates.map((c) => `audit_events_${c.year}_${pad2(c.month)}`);
      const existing = await this.prisma.$queryRaw<Array<{ name: string }>>`
        SELECT inhrelid::regclass::text AS name
          FROM pg_inherits
         WHERE inhparent = 'public.audit_events'::regclass
      `;
      const existsSet = new Set(existing.map((r) => r.name));
      // Lookahead = the longest consecutive run of present partitions
      // starting from `now`. A gap (e.g. month 3 missing) caps the
      // gauge at 2 even if month 4 happens to exist.
      let consecutive = 0;
      for (const name of names) {
        if (existsSet.has(name) || existsSet.has(`"${name}"`)) {
          consecutive += 1;
        } else {
          break;
        }
      }
      this.gauge.set(consecutive);
    } catch (err) {
      this.logger.warn(`partition-lookahead sample failed: ${(err as Error).message}`);
    } finally {
      this.sampling = false;
    }
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
