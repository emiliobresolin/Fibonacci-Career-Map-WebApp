import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import type { RequestUser } from '../auth/auth.types.js';
import { Roles } from '../auth/roles.decorator.js';
import { DlqAdminService } from './dlq-admin.service.js';
import type { QueueName } from './queues.config.js';

const VALID_QUEUES: QueueName[] = [
  '__smoke',
  'audit.outbox-relay',
  'scoring.recalc-employee',
  'scoring.recalc-org-bulk',
  'evidence.expiry-scan',
  'snapshot.partition-maintenance',
  'notification.deliver',
];

/**
 * Admin-only DLQ operations API (Story 4-5 AC1 + AC2).
 *
 *   GET  /v1/dlq                      — list DLQ depth + last N failures per queue
 *   POST /v1/dlq/:queue/:jobId/replay — re-enqueue a failed job onto its
 *                                       original main queue
 *
 * `@Roles('ADMIN')` on the controller — every endpoint is admin-gated.
 * The global JwtAuthGuard (Story 2-4) enforces the role check before
 * the controller code runs.
 *
 * Audit emission today is structured pino logs (`op: 'dlq_replay'`
 * + actorId + originalJobId + newJobId). Outbox-emitted audit events
 * require extending the AuditEvent taxonomy in @fcm/domain-contracts
 * with a `dlq.job_replayed` variant — deferred to a follow-up paired
 * with the 2-7 bootstrap/recovery audit variants.
 */
@Controller('v1/dlq')
@Roles('ADMIN')
export class DlqAdminController {
  private readonly logger = new Logger(DlqAdminController.name);

  constructor(@Inject(DlqAdminService) private readonly dlq: DlqAdminService) {}

  @Get()
  async list(@Query('limit') rawLimit?: string) {
    let limit = 20;
    if (rawLimit !== undefined) {
      const n = Number(rawLimit);
      if (!Number.isFinite(n) || n < 1 || n > 200) {
        throw new BadRequestException('limit must be an integer between 1 and 200');
      }
      limit = Math.floor(n);
    }
    return this.dlq.list(limit);
  }

  @Post(':queue/:jobId/replay')
  async replay(
    @Req() req: Request,
    @Param('queue') queue: string,
    @Param('jobId') jobId: string,
  ): Promise<{ newJobId: string }> {
    if (!VALID_QUEUES.includes(queue as QueueName)) {
      throw new BadRequestException(`Unknown queue: ${queue}`);
    }
    if (typeof jobId !== 'string' || jobId.length === 0 || jobId.length > 256) {
      throw new BadRequestException('jobId must be a non-empty string ≤256 chars');
    }
    const actor = (req as Request & { user?: RequestUser }).user;
    const result = await this.dlq.replay(queue as QueueName, jobId);
    // Audit trail (structured log until taxonomy extension lands).
    this.logger.log(
      {
        op: 'dlq_replay_request',
        actor_user_id: actor?.user_id ?? null,
        organization_id: actor?.organization_id ?? null,
        queue,
        original_job_id: jobId,
        new_job_id: result.newJobId,
      },
      'DLQ replay requested by admin',
    );
    return result;
  }
}
