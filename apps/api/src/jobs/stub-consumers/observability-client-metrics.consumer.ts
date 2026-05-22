import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { QUEUES } from '../queues.config.js';
import { NotImplementedError } from './not-implemented.js';

const QUEUE = 'observability.client-metrics' as const;

@Processor(QUEUE, {
  concurrency: QUEUES[QUEUE].concurrency,
  ...(QUEUES[QUEUE].rateLimit ? { limiter: QUEUES[QUEUE].rateLimit } : {}),
})
export class ObservabilityClientMetricsStubConsumer extends WorkerHost {
  private readonly logger = new Logger(ObservabilityClientMetricsStubConsumer.name);

  async process(_job: Job): Promise<never> {
    throw new NotImplementedError(QUEUE, '11-8');
  }

  @OnWorkerEvent('failed')
  onFailed(_job: Job, err: Error): void {
    this.logger.warn(`${QUEUE} stub job failed: ${err.message}`);
  }
}
