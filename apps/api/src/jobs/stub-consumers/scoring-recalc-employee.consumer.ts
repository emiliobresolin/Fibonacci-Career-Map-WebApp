import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { QUEUES } from '../queues.config.js';
import { NotImplementedError } from './not-implemented.js';

const QUEUE = 'scoring.recalc-employee' as const;

@Processor(QUEUE, {
  concurrency: QUEUES[QUEUE].concurrency,
  ...(QUEUES[QUEUE].rateLimit ? { limiter: QUEUES[QUEUE].rateLimit } : {}),
})
export class ScoringRecalcEmployeeStubConsumer extends WorkerHost {
  private readonly logger = new Logger(ScoringRecalcEmployeeStubConsumer.name);

  async process(_job: Job): Promise<never> {
    throw new NotImplementedError(QUEUE, '9-5');
  }

  @OnWorkerEvent('failed')
  onFailed(_job: Job, err: Error): void {
    // Stub consumers don't promote to DLQ themselves — Story 4-5 ships
    // the DLQ admin tool + alerting. Log only.
    this.logger.warn(`${QUEUE} stub job failed: ${err.message}`);
  }
}
