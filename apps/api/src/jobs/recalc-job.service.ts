import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';

/**
 * Recalc-job idempotency registry (Story 4-3, Arch §7.3, FR-5.9).
 *
 * Every score recalc the system performs is keyed on
 * `(employee_id, triggering_event_id)`. The triggering_event_id is
 * the outbox row that produced the recalc — evidence approval, role
 * change, configuration change, etc.
 *
 * Contract:
 *
 *   • `claim()` — opens a row for the pair. Three outcomes:
 *       - first-time call: INSERT a `pending` row, return it. The
 *         consumer proceeds with the recalc work.
 *       - already `completed`: throw `AlreadyCompletedError`. The
 *         consumer skips silently (BullMQ marks the job done; the
 *         duplicate is a no-op).
 *       - already `pending`: return the existing row (rare — happens
 *         when a previous attempt crashed between claim and
 *         markCompleted). The consumer re-attempts the recalc; the
 *         subsequent markCompleted is idempotent.
 *
 *   • `markCompleted()` — flips status='completed', completed_at=NOW().
 *
 *   • `markFailed()` — flips status='failed' + records the reason.
 *     A failed row blocks future retries for the same (employee, event)
 *     pair until an operator clears it via the DLQ admin (Story 4-5);
 *     the orchestrator does not re-claim on its own.
 *
 * All three calls run inside `withOrgScope` so the RLS policy on
 * `recalc_jobs` permits the read/write.
 */
@Injectable()
export class RecalcJobService {
  private readonly logger = new Logger(RecalcJobService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async claim(args: {
    organizationId: string;
    employeeId: string;
    triggeringEventId: string;
  }): Promise<RecalcJobRow> {
    return withOrgScope(this.prisma, args.organizationId, async (tx) => {
      // SELECT FOR UPDATE only locks an EXISTING row. If the row doesn't
      // exist yet, the FOR UPDATE returns 0 rows and takes NO lock — two
      // concurrent claimants will both see nothing here and both try to
      // INSERT. The unique index on (employee_id, triggering_event_id)
      // is the actual race resolver: one INSERT wins, the other raises
      // P2002 which we resolve via a SAVEPOINT-protected re-read below.
      const existing = await tx.$queryRaw<RecalcJobRow[]>`
        SELECT "id", "organization_id" AS "organizationId",
               "employee_id"           AS "employeeId",
               "triggering_event_id"   AS "triggeringEventId",
               "status",
               "created_at"            AS "createdAt",
               "completed_at"          AS "completedAt"
          FROM "recalc_jobs"
         WHERE "employee_id" = ${args.employeeId}::uuid
           AND "triggering_event_id" = ${args.triggeringEventId}::uuid
         FOR UPDATE
      `;
      const row = existing[0];
      if (row) {
        if (row.status === 'completed') {
          throw new AlreadyCompletedError(args.employeeId, args.triggeringEventId);
        }
        if (row.status === 'failed') {
          throw new PreviouslyFailedError(args.employeeId, args.triggeringEventId);
        }
        // Status is pending — a previous attempt died mid-flight. Let
        // the consumer retry against this row; markCompleted is
        // idempotent so the retry converges.
        this.logger.warn(
          `recalc_jobs row already pending for employee=${args.employeeId} event=${args.triggeringEventId} — retrying`,
        );
        return row;
      }
      // SAVEPOINT before the INSERT so a P2002 unique-violation doesn't
      // abort the OUTER transaction — Postgres marks the txn aborted on
      // any constraint error, and follow-up queries would fail with
      // 25P02 "current transaction is aborted". With the savepoint we
      // can ROLLBACK to it after P2002, restoring the txn to a healthy
      // state, then re-read the survivor row.
      await tx.$executeRaw`SAVEPOINT claim_insert`;
      try {
        const created = await tx.recalcJob.create({
          data: {
            organizationId: args.organizationId,
            employeeId: args.employeeId,
            triggeringEventId: args.triggeringEventId,
            status: 'pending',
          },
        });
        await tx.$executeRaw`RELEASE SAVEPOINT claim_insert`;
        return {
          id: created.id,
          organizationId: created.organizationId,
          employeeId: created.employeeId,
          triggeringEventId: created.triggeringEventId,
          status: created.status as RecalcJobStatus,
          createdAt: created.createdAt,
          completedAt: created.completedAt,
        };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          // Restore the txn to a healthy state, then re-read the survivor.
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT claim_insert`;
          const survivor = await tx.recalcJob.findUnique({
            where: {
              employeeId_triggeringEventId: {
                employeeId: args.employeeId,
                triggeringEventId: args.triggeringEventId,
              },
            },
          });
          if (!survivor) throw err;
          if (survivor.status === 'completed') {
            throw new AlreadyCompletedError(args.employeeId, args.triggeringEventId);
          }
          if (survivor.status === 'failed') {
            throw new PreviouslyFailedError(args.employeeId, args.triggeringEventId);
          }
          return {
            id: survivor.id,
            organizationId: survivor.organizationId,
            employeeId: survivor.employeeId,
            triggeringEventId: survivor.triggeringEventId,
            status: survivor.status as RecalcJobStatus,
            createdAt: survivor.createdAt,
            completedAt: survivor.completedAt,
          };
        }
        // Non-P2002 error: ROLLBACK the savepoint anyway so the rethrow
        // doesn't poison subsequent statements in the outer transaction.
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT claim_insert`;
        throw err;
      }
    });
  }

  async markCompleted(args: { organizationId: string; jobId: string }): Promise<void> {
    await withOrgScope(this.prisma, args.organizationId, (tx) =>
      tx.recalcJob.update({
        where: { id: args.jobId },
        data: { status: 'completed', completedAt: new Date() },
      }),
    );
  }

  async markFailed(args: {
    organizationId: string;
    jobId: string;
    reason: string;
  }): Promise<void> {
    await withOrgScope(this.prisma, args.organizationId, (tx) =>
      tx.recalcJob.update({
        where: { id: args.jobId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          failureReason: args.reason.slice(0, 1000),
        },
      }),
    );
  }
}

export type RecalcJobStatus = 'pending' | 'completed' | 'failed';

export type RecalcJobRow = {
  id: string;
  organizationId: string;
  employeeId: string;
  triggeringEventId: string;
  status: RecalcJobStatus;
  createdAt: Date;
  completedAt: Date | null;
};

/**
 * Raised when `claim()` finds an existing `completed` row for the same
 * (employee_id, triggering_event_id) pair. The consumer should treat
 * this as a successful no-op — the work was done by a previous attempt.
 */
export class AlreadyCompletedError extends Error {
  readonly code = 'RECALC_ALREADY_COMPLETED' as const;
  readonly employeeId: string;
  readonly triggeringEventId: string;

  constructor(employeeId: string, triggeringEventId: string) {
    super(
      `recalc already completed for employee=${employeeId} triggeringEvent=${triggeringEventId}`,
    );
    this.name = 'AlreadyCompletedError';
    this.employeeId = employeeId;
    this.triggeringEventId = triggeringEventId;
    Object.setPrototypeOf(this, AlreadyCompletedError.prototype);
  }
}

/**
 * Raised when `claim()` finds an existing `failed` row. The consumer
 * does NOT auto-retry — a failed row indicates the previous attempt
 * exhausted its retry budget and an operator must inspect the cause
 * before clearing it (via Story 4-5's DLQ admin).
 */
export class PreviouslyFailedError extends Error {
  readonly code = 'RECALC_PREVIOUSLY_FAILED' as const;
  readonly employeeId: string;
  readonly triggeringEventId: string;

  constructor(employeeId: string, triggeringEventId: string) {
    super(
      `recalc previously failed for employee=${employeeId} triggeringEvent=${triggeringEventId} — operator action required`,
    );
    this.name = 'PreviouslyFailedError';
    this.employeeId = employeeId;
    this.triggeringEventId = triggeringEventId;
    Object.setPrototypeOf(this, PreviouslyFailedError.prototype);
  }
}
