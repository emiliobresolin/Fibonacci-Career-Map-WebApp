import { BullModule } from '@nestjs/bullmq';
import { Module, type DynamicModule } from '@nestjs/common';

import { ObservabilityModule } from '../observability/observability.module.js';
import { PartitionLookaheadService } from './partition-lookahead.service.js';
import { PartitionMaintenanceConsumer } from './partition-maintenance.consumer.js';
import { PartitionMaintenanceScheduler } from './partition-maintenance.scheduler.js';

/**
 * Partition-maintenance module (Story 3-6, Arch §6.4 / AR-8).
 *
 *   - Worker mode: registers the cron scheduler + consumer that ensure
 *     audit_events partitions exist 3 months out.
 *   - Api mode: registers nothing — the api never runs partition
 *     maintenance.
 *
 * The Prometheus lookahead gauge (PartitionLookaheadService) runs in
 * worker mode only — the api never connects to Postgres for this; the
 * gauge exporter is part of the same metrics surface as the relay
 * depth gauge.
 */
@Module({})
export class PartitionsModule {
  static register(opts: { mode: 'api' | 'worker' }): DynamicModule {
    if (opts.mode !== 'worker') {
      return { module: PartitionsModule };
    }
    return {
      module: PartitionsModule,
      imports: [
        ObservabilityModule,
        BullModule.registerQueue({ name: 'snapshot.partition-maintenance' }),
        BullModule.registerQueue({ name: 'snapshot.partition-maintenance.dlq' }),
      ],
      providers: [PartitionMaintenanceConsumer, PartitionMaintenanceScheduler, PartitionLookaheadService],
    };
  }
}
