import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import { CRON_METADATA_KEY, type CronJobSpec, type CronMetadata } from './cron.decorator.js';

/**
 * CronRegistrarService (Story 4-4 AC1).
 *
 * Walks every Nest provider at application bootstrap, finds methods
 * carrying `@Cron(...)` metadata, invokes each once to obtain a
 * `CronJobSpec`, and registers a BullMQ repeatable job against the
 * configured queue with the decorator's pattern + timezone.
 *
 * Deterministic `jobId = cron:<ClassName>.<methodName>` so a worker
 * restart or a second replica registering the same shape is a no-op
 * rather than a duplicate schedule. BullMQ's repeatable-job dedup is
 * keyed on (jobId, pattern, timezone).
 *
 * Worker-mode only — registered in `apps/api/src/jobs/jobs.module.ts`
 * inside the `opts.mode === 'worker'` branch. The api-mode process
 * never enqueues a cron; running the registrar in both modes would
 * produce duplicate schedules (BullMQ would dedup them, but the
 * mental model is "workers schedule cron, api just produces").
 */
@Injectable()
export class CronRegistrarService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CronRegistrarService.name);

  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner) private readonly scanner: MetadataScanner,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const providers = this.discovery.getProviders();
    const registrations: Promise<void>[] = [];
    for (const wrapper of providers) {
      const instance = wrapper.instance;
      if (!instance || typeof instance !== 'object') continue;
      const proto = Object.getPrototypeOf(instance);
      if (!proto) continue;
      const methodNames = this.scanner.getAllMethodNames(proto);
      for (const methodName of methodNames) {
        const fn = (instance as Record<string, unknown>)[methodName];
        if (typeof fn !== 'function') continue;
        const meta = Reflect.getMetadata(CRON_METADATA_KEY, fn) as CronMetadata | undefined;
        if (!meta) continue;
        registrations.push(
          this.registerOne({
            instance: instance as Record<string, unknown>,
            methodName,
            className: instance.constructor.name,
            meta,
          }),
        );
      }
    }
    await Promise.all(registrations);
  }

  private async registerOne(args: {
    instance: Record<string, unknown>;
    methodName: string;
    className: string;
    meta: CronMetadata;
  }): Promise<void> {
    const { instance, methodName, className, meta } = args;
    const fn = instance[methodName] as () => CronJobSpec | Promise<CronJobSpec>;
    let spec: CronJobSpec;
    try {
      spec = await fn.call(instance);
    } catch (err) {
      this.logger.error(
        `cron ${className}.${methodName}: registration helper threw: ${(err as Error).message}`,
      );
      return;
    }
    const token = getQueueToken(meta.queueName);
    let queue: Queue;
    try {
      queue = this.moduleRef.get<Queue>(token, { strict: false });
    } catch (err) {
      this.logger.error(
        `cron ${className}.${methodName}: queue '${meta.queueName}' is not registered with BullModule. Did you add it to ACTIVE_QUEUES?`,
      );
      return;
    }
    const jobId = `cron:${className}.${methodName}`;
    const timezone = meta.options.timezone ?? 'UTC';
    try {
      await queue.add(spec.jobName, spec.data, {
        repeat: { pattern: meta.pattern, tz: timezone },
        jobId,
      });
      this.logger.log(
        `cron registered: ${className}.${methodName} → ${meta.queueName} pattern='${meta.pattern}' tz=${timezone}`,
      );
    } catch (err) {
      // Don't crash boot on a Redis blip — the next worker restart
      // will re-attempt. The DLQ-depth alert (Story 4-5) catches a
      // queue with no recent cron-emitted jobs.
      this.logger.warn(
        `cron ${className}.${methodName}: failed to register on ${meta.queueName}: ${(err as Error).message}`,
      );
    }
  }
}
