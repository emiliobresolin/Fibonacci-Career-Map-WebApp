import { BullModule } from '@nestjs/bullmq';
import { Module, type DynamicModule } from '@nestjs/common';

import { ObservabilityModule } from '../observability/observability.module.js';
import { OutboxDepthService } from './outbox-depth.service.js';
import { OutboxListenerService } from './outbox-listener.service.js';
import { OutboxRelayConsumer } from './outbox-relay.consumer.js';

/**
 * Outbox relay module (Arch §9.3 / AD-7 / Story 3-3).
 *
 * Worker mode wires:
 *   - OutboxListenerService → maintains LISTEN outbox_new + catch-up scan +
 *     enqueues relay jobs (idempotent jobId=eventId)
 *   - OutboxRelayConsumer → processes one event_id per job: writes audit_events,
 *     marks outbox_events.published_at, DLQ on terminal failure
 *   - OutboxDepthService → emits the fcm_outbox_relay_depth Prometheus gauge
 *
 * Api mode wires nothing — the api never relays. Producers (controllers /
 * services that INSERT into outbox_events) go through PrismaModule.
 *
 * Both modes import the BullMQ queue tokens (BullModule.registerQueueAsync
 * is already done in JobsModule); we re-import via BullModule.registerQueue
 * here to make the @InjectQueue('audit.outbox-relay') resolution explicit
 * inside this module's scope.
 */
@Module({})
export class OutboxModule {
  static register(opts: { mode: 'api' | 'worker' }): DynamicModule {
    if (opts.mode !== 'worker') {
      // Api mode has nothing to register — keep the module loadable so
      // AppModule's import list stays mode-agnostic.
      return { module: OutboxModule };
    }
    return {
      module: OutboxModule,
      imports: [
        // MetricsService lives in ObservabilityModule — OutboxDepthService
        // registers its gauge against it.
        ObservabilityModule,
        // Re-export the audit.outbox-relay + DLQ queue tokens so the
        // listener + consumer can @InjectQueue them. JobsModule's exports
        // bubble the underlying BullModule registrations, so this re-import
        // is a no-op connection-wise — it only widens the DI scope.
        BullModule.registerQueue({ name: 'audit.outbox-relay' }),
        BullModule.registerQueue({ name: 'audit.outbox-relay.dlq' }),
      ],
      providers: [OutboxListenerService, OutboxRelayConsumer, OutboxDepthService],
    };
  }
}
