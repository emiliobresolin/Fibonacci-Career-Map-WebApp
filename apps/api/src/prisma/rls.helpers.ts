import { AsyncLocalStorage } from 'node:async_hooks';

import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Layer-3 Row-Level Security helpers (Story 2-6, Arch §10.3 Layer 3).
 *
 * Postgres RLS policies (defined in the 20260525_row_level_security
 * migration) gate every tenant-scoped table on the GUC
 * `app.current_org_id`. Closed-fail when unset.
 *
 * Two entry points:
 *
 *   • `withOrgScope(prisma, orgId, fn)` — opens a Prisma transaction,
 *     issues `SET LOCAL app.current_org_id = '<uuid>'`, then runs `fn`
 *     with the transaction client. `SET LOCAL` is scoped to the
 *     transaction; the GUC resets when the transaction commits or
 *     rolls back. Caller passes the transaction client (`tx`) down
 *     to every query that needs the scope.
 *
 *   • `RlsScope.run(orgId, fn)` — AsyncLocalStorage scope used by the
 *     HTTP interceptor + BullMQ wrapper so services downstream can
 *     fetch the current orgId without it being threaded through every
 *     argument. Reading from this store is purely advisory — the only
 *     enforcement is the SET LOCAL inside withOrgScope.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Wrap a unit of work in a Prisma transaction whose GUC
 * `app.current_org_id` is set so RLS policies on tenant-scoped tables
 * filter to the correct organization.
 *
 * The orgId is UUID-validated before the SQL is built — the value
 * still flows through a parameter binding, but defense-in-depth: an
 * invalid uuid produces a structured error rather than a Postgres
 * `invalid input syntax for type uuid` that the caller has to parse.
 *
 * Returns whatever `fn` returns. If `fn` throws, the transaction
 * rolls back AND the GUC resets — Postgres's atomicity guarantee.
 */
export async function withOrgScope<T>(
  prisma: PrismaClient,
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!isUuid(organizationId)) {
    throw new RlsInvalidOrgIdError(organizationId);
  }
  return prisma.$transaction(async (tx) => {
    // Parameter-bind the orgId through Prisma's tagged-template helper
    // so the literal can't be SQL-injected. Cast to uuid so the policy's
    // `current_setting(...)::uuid` cast doesn't fail at first SELECT.
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

/**
 * Raised when `withOrgScope` is called with a value that isn't a
 * canonical UUID. Carries the bad input (truncated for log safety)
 * so the audit pipeline can correlate the rejection.
 */
export class RlsInvalidOrgIdError extends Error {
  readonly code = 'RLS_INVALID_ORG_ID' as const;
  readonly badValue: string;

  constructor(badValue: string) {
    const safe = typeof badValue === 'string' ? badValue.slice(0, 64) : String(badValue).slice(0, 64);
    super(`Invalid organizationId for RLS scope: ${JSON.stringify(safe)}`);
    this.name = 'RlsInvalidOrgIdError';
    this.badValue = safe;
    Object.setPrototypeOf(this, RlsInvalidOrgIdError.prototype);
  }
}

// ─── AsyncLocalStorage scope ─────────────────────────────────────────
//
// Used by the HTTP interceptor + job wrapper so any code path that
// needs the current orgId can read it without it being threaded
// through every function argument. The store is advisory — the
// ENFORCEMENT comes from withOrgScope's SET LOCAL inside a transaction.

type RlsStore = { organizationId: string };
const als = new AsyncLocalStorage<RlsStore>();

export const RlsScope = {
  /** Run `fn` with the current orgId associated with the async context. */
  run<T>(organizationId: string, fn: () => T): T {
    if (!isUuid(organizationId)) {
      throw new RlsInvalidOrgIdError(organizationId);
    }
    return als.run({ organizationId }, fn);
  },
  /** Read the orgId associated with the current async context, or `undefined`
   *  if no `run()` is currently active (e.g. a route that didn't pass
   *  through the RlsContextInterceptor). */
  current(): string | undefined {
    return als.getStore()?.organizationId;
  },
};
