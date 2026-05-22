import { Injectable } from '@nestjs/common';

import { Cron, type CronJobSpec } from './cron.decorator.js';

/**
 * Story 4-4 AC2: a no-op heartbeat cron registered every minute.
 *
 * Runs against the `__smoke` queue (which already has the SmokeConsumer
 * + DLQ wired by Story 4-1). Every fire produces a `noop` job whose
 * data carries the trigger timestamp. The job completes via
 * SmokeConsumer's existing 'noop' handler — no new consumer needed.
 *
 * The job's effect is observable in two places:
 *   • `fcm_queue_processing_duration_seconds{queue="__smoke"}` registers
 *     a fast successful observation every minute (heartbeat → liveness
 *     of the worker fleet + queue pipeline).
 *   • A stale `__smoke` queue (depth > 0 for > 5 minutes) indicates
 *     workers aren't draining — the same alert the production queues
 *     use, exercised on a guaranteed-arrival schedule.
 *
 * This cron exists ONLY in worker mode (registered via JobsModule);
 * api-mode never sees it.
 */
@Injectable()
export class HeartbeatCron {
  @Cron('* * * * *', '__smoke')
  heartbeat(): CronJobSpec {
    return {
      jobName: 'noop',
      data: { echo: `heartbeat` },
    };
  }
}
