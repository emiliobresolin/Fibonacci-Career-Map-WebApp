import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';

/**
 * Registers the weekly partition-maintenance repeatable job on worker
 * boot (Story 3-6 AC1). BullMQ dedupes repeatable jobs by the
 * `(name, repeat.pattern, repeat.tz)` triple — a worker restart or a
 * second replica registering the same shape produces no duplicate
 * schedule.
 *
 * Cron pattern `0 0 * * 0` — every Sunday at 00:00 UTC. Three months of
 * lookahead means the next 12 weeks always have partitions; even a
 * three-week consecutive cron outage stays within the buffer.
 */
@Injectable()
export class PartitionMaintenanceScheduler implements OnModuleInit {
  private readonly logger = new Logger(PartitionMaintenanceScheduler.name);
  private static readonly CRON_PATTERN = '0 0 * * 0';
  private static readonly TIMEZONE = 'UTC';

  constructor(
    @InjectQueue('snapshot.partition-maintenance') private readonly queue: Queue,
  ) {}

  onModuleInit(): void {
    // Fire-and-forget so a Redis blip (or a test environment without
    // Redis) doesn't block worker boot. BullMQ's connection has
    // maxRetriesPerRequest:null on the blocking client; without that
    // guard a queue.add() can hang for the cache-miss window.
    this.registerCron().catch((err) => {
      this.logger.warn(`partition-maintenance cron registration failed: ${(err as Error).message}`);
    });
  }

  private async registerCron(): Promise<void> {
    // Run the job once at boot too — first deployment of the worker
    // shouldn't wait up to a week for the first partition sweep.
    await this.queue.add('partition-maintenance', {}, { jobId: 'partition-maintenance:boot' });

    await this.queue.add(
      'partition-maintenance',
      {},
      {
        repeat: {
          pattern: PartitionMaintenanceScheduler.CRON_PATTERN,
          tz: PartitionMaintenanceScheduler.TIMEZONE,
        },
        // jobId on a repeatable job makes BullMQ idempotent across worker
        // restarts and across replicas — the second registration with
        // the same pattern is a no-op rather than a duplicate schedule.
        jobId: 'partition-maintenance:cron',
      },
    );
    this.logger.log(
      `partition-maintenance cron registered (${PartitionMaintenanceScheduler.CRON_PATTERN} ${PartitionMaintenanceScheduler.TIMEZONE})`,
    );
  }
}
