import { BullModule } from '@nestjs/bullmq';
import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';

import type { Env } from '../common/env.config.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { CronRegistrarService } from './cron-registrar.service.js';
import { DlqAdminController } from './dlq-admin.controller.js';
import { DlqAdminService } from './dlq-admin.service.js';
import { HeartbeatCron } from './heartbeat-cron.js';
import { QueueMetricsService } from './queue-metrics.service.js';
import { RecalcJobService } from './recalc-job.service.js';
import { SmokeConsumer } from './smoke.consumer.js';
import { EvidenceExpiryScanStubConsumer } from './stub-consumers/evidence-expiry-scan.consumer.js';
import { NotificationDeliverStubConsumer } from './stub-consumers/notification-deliver.consumer.js';
import { ObservabilityClientMetricsStubConsumer } from './stub-consumers/observability-client-metrics.consumer.js';
import { ScoringRecalcEmployeeStubConsumer } from './stub-consumers/scoring-recalc-employee.consumer.js';
import { ScoringRecalcOrgBulkStubConsumer } from './stub-consumers/scoring-recalc-org-bulk.consumer.js';
import { ACTIVE_QUEUES, QUEUES, dlqOf, type QueueName } from './queues.config.js';

/**
 * BullMQ wiring for the worker process (Arch §7.1, AD-5).
 *
 * Design notes:
 *  - The api-mode process imports JobsModule so it can ENQUEUE; the worker-
 *    mode process additionally registers the consumer providers. Story 4-1
 *    AC2 mandates this split — a stray worker registration in api-mode
 *    would steal jobs from the worker fleet.
 *  - Only queues in ACTIVE_QUEUES are registered with BullModule (open ioredis
 *    connections). Future stories extend ACTIVE_QUEUES as they ship their
 *    producer/consumer pair (3-3 adds audit.outbox-relay, 9-5 adds
 *    scoring.recalc-employee, etc.). Registering all 8 queues at this point
 *    would open 8 unused ioredis connections per api-mode boot.
 *  - REDIS_URL is required in worker mode regardless of NODE_ENV. The dev/
 *    test fallback to localhost:6379 only applies to api-mode (where the
 *    queue producer is harmless when no consumer is reachable) and only
 *    when NODE_ENV != 'production'.
 *  - BullMQ requires `maxRetriesPerRequest: null` on the blocking consumer
 *    client (the worker does BRPOPLPUSH that should never time-budget out)
 *    AND `enableReadyCheck: false` to avoid spurious READONLY checks during
 *    failover. Both are critical for Redis-disconnect resilience.
 */
@Module({})
export class JobsModule {
  static register(opts: { mode: 'api' | 'worker' }): DynamicModule {
    const queueRegistrations = ACTIVE_QUEUES.flatMap((name) => [
      BullModule.registerQueueAsync({
        name,
        useFactory: () => ({
          defaultJobOptions: {
            attempts: QUEUES[name].maxAttempts,
            backoff: { type: QUEUES[name].backoff.type, delay: QUEUES[name].backoff.delayMs },
            removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
            removeOnFail: { age: 7 * 24 * 60 * 60, count: 10_000 },
          },
        }),
      }),
      // Companion DLQ — declared in queues.config and registered here so
      // the consumer can `@InjectQueue(dlqOf(name))` to promote terminal
      // failures. Retention bounded so the DLQ doesn't grow without limit
      // when the operator is slow to drain (manual triage in MVP).
      ...(dlqOf(name)
        ? [
            BullModule.registerQueueAsync({
              name: dlqOf(name)!,
              useFactory: () => ({
                defaultJobOptions: {
                  attempts: 1,
                  removeOnComplete: { age: 30 * 24 * 60 * 60, count: 50_000 },
                },
              }),
            }),
          ]
        : []),
    ]);

    // Stub consumers (Story 4-2) — every architecture-listed queue gets
    // a NotImplementedError-throwing consumer until the owning story
    // ships the real one. Stub consumers run in worker mode only.
    const stubConsumers = [
      ScoringRecalcEmployeeStubConsumer,
      ScoringRecalcOrgBulkStubConsumer,
      EvidenceExpiryScanStubConsumer,
      NotificationDeliverStubConsumer,
      ObservabilityClientMetricsStubConsumer,
    ];

    return {
      module: JobsModule,
      imports: [
        // ObservabilityModule for MetricsService (QueueMetricsService
        // registers gauges + histograms against the shared registry).
        ObservabilityModule,
        // DiscoveryModule provides DiscoveryService + MetadataScanner
        // that CronRegistrarService uses to walk the provider graph
        // and find @Cron-decorated methods (Story 4-4).
        DiscoveryModule,
        BullModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (config: ConfigService<Env, true>) => {
            const redisUrl = config.get('REDIS_URL', { infer: true });
            const nodeEnv = config.get('NODE_ENV', { infer: true });
            // Production worker mode demands a real REDIS_URL — silent
            // localhost fallback would leak into staging if env was
            // misconfigured. Production env-validation already enforces
            // REDIS_URL via superRefine, but this is the defense-in-depth
            // layer that fires even if env-validation were ever loosened.
            if (opts.mode === 'worker' && nodeEnv === 'production' && !redisUrl) {
              throw new Error('REDIS_URL must be set in production worker mode (no localhost fallback)');
            }
            // Dev/test fallback so the scaffold bootstrap test (and dev
            // workers with a local Redis on 6379) can boot. Production is
            // gated above.
            const connection = redisUrl
              ? {
                  url: redisUrl,
                  maxRetriesPerRequest: null,
                  enableReadyCheck: false,
                }
              : {
                  host: 'localhost',
                  port: 6379,
                  maxRetriesPerRequest: null,
                  enableReadyCheck: false,
                };
            return { connection };
          },
          inject: [ConfigService],
        }),
        ...queueRegistrations,
      ],
      controllers: opts.mode === 'api' ? [DlqAdminController] : [],
      providers: [
        QueueMetricsService,
        RecalcJobService,
        // DlqAdminService is api-mode only — it's the back-end of the
        // /v1/dlq admin endpoints. The worker mode has no use for it.
        ...(opts.mode === 'api' ? [DlqAdminService] : []),
        ...(opts.mode === 'worker'
          ? [
              SmokeConsumer,
              ...stubConsumers,
              // Story 4-4: cron infrastructure runs in worker mode only.
              // api-mode never registers cron schedules — workers own
              // that responsibility, and BullMQ would dedup duplicates
              // anyway, but keeping them out of api-mode avoids the
              // operational confusion.
              CronRegistrarService,
              HeartbeatCron,
            ]
          : []),
      ],
      exports: [...queueRegistrations, QueueMetricsService, RecalcJobService],
    };
  }
}
