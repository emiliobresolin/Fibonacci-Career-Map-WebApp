import type { QueueName } from './queues.config.js';

/**
 * Cron-scheduling decorator (Story 4-4, Arch §7.2).
 *
 *   @Cron('0 0 * * 0', 'snapshot.partition-maintenance', { timezone: 'UTC' })
 *   weeklyMaintenance() {
 *     return { jobName: 'maintain', data: { anchor: new Date().toISOString() } };
 *   }
 *
 * The decorated method is invoked ONCE at worker boot by the
 * `CronRegistrarService`. Its return value tells the registrar which
 * BullMQ job to enqueue (jobName + data) on the configured queue,
 * with the cron pattern attached via BullMQ's repeatable-job API.
 *
 * `pattern` follows standard 5-field crontab syntax. `timezone`
 * defaults to UTC; pass an IANA name (e.g. 'America/Sao_Paulo') for
 * per-job overrides. AC3.
 *
 * BullMQ dedupes repeatable jobs on (jobId, pattern, timezone), so a
 * worker restart or a second replica producing the same `jobId` is a
 * no-op rather than a duplicate schedule. The registrar derives a
 * deterministic jobId from the class name + method name.
 */
export const CRON_METADATA_KEY = 'fcm:cron' as const;

export type CronOptions = {
  /** IANA timezone name. Defaults to 'UTC'. */
  timezone?: string;
};

export type CronMetadata = {
  pattern: string;
  queueName: QueueName;
  options: CronOptions;
};

/** Spec returned by a `@Cron`-decorated method — names the job + payload
 *  the cron should enqueue on each scheduled fire. */
export type CronJobSpec<TPayload = unknown> = {
  jobName: string;
  data: TPayload;
};

export function Cron(
  pattern: string,
  queueName: QueueName,
  options: CronOptions = {},
): MethodDecorator {
  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    if (typeof descriptor.value !== 'function') {
      throw new Error('@Cron can only decorate methods');
    }
    const meta: CronMetadata = { pattern, queueName, options };
    Reflect.defineMetadata(CRON_METADATA_KEY, meta, descriptor.value);
    return descriptor;
  };
}
