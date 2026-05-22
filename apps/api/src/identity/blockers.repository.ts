import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { BlockerKind, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';

export type BlockerRow = {
  id: string;
  organizationId: string;
  employeeId: string;
  kind: BlockerKind;
  reason: string;
  openedAt: Date;
  resolvedAt: Date | null;
  openedBy: string;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OpenBlockerInput = {
  employeeId: string;
  kind: BlockerKind;
  reason: string;
  openedBy: string;
};

export type ResolveBlockerInput = {
  resolvedBy: string;
  resolutionNote?: string | null;
};

/**
 * Repository for `employee_blockers` (Story 6-2b, PRD §7.5 condition 4
 * + §8.5). Co-located with EmployeesRepository in the identity module
 * because the table is conceptually a sub-aspect of an employee's
 * state — every read of "is this employee blocked?" passes through
 * `hasActiveBlocker` and downstream Epic 9 eligibility evaluation
 * will inject this repo.
 *
 * Every state-changing write (open, resolve) is paired with an
 * outbox emission inside the same `withOrgScope` transaction so the
 * relay (Story 3-3) lands an audit_events row atomically. The
 * AuditEvent variants (`blocker.opened`, `blocker.resolved`) are
 * declared in `@fcm/domain-contracts/events/audit.ts`.
 */
@Injectable()
export class BlockersRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ── Reads ────────────────────────────────────────────────────────

  async findById(organizationId: string, id: string): Promise<BlockerRow | null> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employeeBlocker.findUnique({ where: { id } }),
    );
  }

  async listForEmployee(organizationId: string, employeeId: string): Promise<BlockerRow[]> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employeeBlocker.findMany({
        where: { employeeId },
        orderBy: { openedAt: 'desc' },
      }),
    );
  }

  /**
   * Canonical eligibility-evaluator read (Arch §6.2):
   *   `EXISTS(... WHERE resolved_at IS NULL)`
   *
   * Implemented as a `findFirst` because Prisma doesn't expose a
   * cheap EXISTS primitive — but the supporting partial index
   * (`employee_blockers_active_employee_idx`) makes the underlying
   * query cheap. Returns a boolean so the caller can't accidentally
   * leak the blocker's identity into a visibility-sensitive surface.
   */
  async hasActiveBlocker(organizationId: string, employeeId: string): Promise<boolean> {
    const row = await withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employeeBlocker.findFirst({
        where: { employeeId, resolvedAt: null },
        select: { id: true },
      }),
    );
    return row !== null;
  }

  // ── Writes (paired with outbox emission) ─────────────────────────

  /**
   * Open a new blocker AND emit `blocker.opened` via outbox in one
   * transaction. The partial unique index rejects a duplicate active
   * blocker for the same (employee, kind) — surfaces as P2002.
   */
  async open(organizationId: string, input: OpenBlockerInput): Promise<BlockerRow> {
    const eventId = randomUUID();
    return withOrgScope(this.prisma, organizationId, async (tx) => {
      const created = await tx.employeeBlocker.create({
        data: {
          organizationId,
          employeeId: input.employeeId,
          kind: input.kind,
          reason: input.reason,
          openedBy: input.openedBy,
        },
      });
      await tx.outboxEvent.create({
        data: {
          eventId,
          organizationId,
          aggregateType: 'employee_blocker',
          aggregateId: created.id,
          eventType: 'blocker.opened',
          payload: {
            actorId: input.openedBy,
            // Audit row's `reason` is the human-supplied reason text.
            reason: input.reason,
            before: null,
            after: {
              employeeId: created.employeeId,
              kind: created.kind,
            },
          },
        },
      });
      return created;
    });
  }

  /**
   * Resolve an existing OPEN blocker AND emit `blocker.resolved` via
   * outbox in one transaction. Returns the updated row.
   *
   * The DB-level CHECK `employee_blockers_resolution_consistency`
   * enforces that `resolved_at` and `resolved_by` are set together.
   * The conditional `WHERE id = $1 AND resolved_at IS NULL` clause
   * via `updateMany` (then re-fetch) guarantees an already-resolved
   * blocker doesn't double-resolve under concurrency — if zero rows
   * match, we throw `BlockerAlreadyResolvedError` so the controller
   * can translate to a 409.
   */
  async resolve(
    organizationId: string,
    id: string,
    input: ResolveBlockerInput,
  ): Promise<BlockerRow> {
    const eventId = randomUUID();
    const now = new Date();
    return withOrgScope(this.prisma, organizationId, async (tx) => {
      // Conditional update — only flip an OPEN blocker. A concurrent
      // resolver will see updated.count === 0 and short-circuit.
      const updated = await tx.employeeBlocker.updateMany({
        where: { id, resolvedAt: null },
        data: {
          resolvedAt: now,
          resolvedBy: input.resolvedBy,
          resolutionNote: input.resolutionNote ?? null,
        },
      });
      if (updated.count === 0) {
        throw new BlockerAlreadyResolvedError(id);
      }
      const row = await tx.employeeBlocker.findUnique({ where: { id } });
      if (!row) {
        // Defensive: updateMany matched but the row vanished — only
        // possible under an admin-initiated DELETE in flight, which
        // we don't surface today.
        throw new BlockerAlreadyResolvedError(id);
      }
      await tx.outboxEvent.create({
        data: {
          eventId,
          organizationId,
          aggregateType: 'employee_blocker',
          aggregateId: row.id,
          eventType: 'blocker.resolved',
          payload: {
            actorId: input.resolvedBy,
            reason: input.resolutionNote ?? null,
            before: {
              employeeId: row.employeeId,
              kind: row.kind,
            },
            after: null,
          },
        },
      });
      return row;
    });
  }
}

/** Raised when `resolve()` is called on an already-resolved (or
 *  non-existent) blocker. Carries the id so the controller can
 *  translate to a structured 409. */
export class BlockerAlreadyResolvedError extends Error {
  readonly code = 'BLOCKER_ALREADY_RESOLVED' as const;
  readonly blockerId: string;

  constructor(blockerId: string) {
    super(`Blocker ${blockerId} is already resolved (or does not exist)`);
    this.name = 'BlockerAlreadyResolvedError';
    this.blockerId = blockerId;
    Object.setPrototypeOf(this, BlockerAlreadyResolvedError.prototype);
  }
}

/** Helper to recognize Prisma's unique-constraint failure when the
 *  partial unique index rejects a duplicate active blocker. */
export function isDuplicateActiveBlockerError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
