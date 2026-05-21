// Typed queue catalog (Arch §7.2). Single source of truth for queue name,
// concurrency, backoff, max attempts, rate limit, and DLQ target. Adding
// a new queue means an entry here PLUS the registration in jobs.module's
// `__active` set PLUS a consumer class (in worker mode).
//
// Story 4-1 ships only `__smoke` registered + consumed so the AC3 DLQ
// smoke test has something to exercise. The other Arch §7.2 queues are
// declared here as the typed source of truth, but their BullModule
// registration lands with the story that introduces their producer or
// consumer (audit.outbox-relay in 3-3, scoring.recalc-employee in 9-5,
// etc.) — registering them now would open ioredis connections per queue
// without any caller, which the Blind Hunter review flagged as dead
// surface area.

export type QueueName =
  | '__smoke'
  | 'audit.outbox-relay'
  | 'scoring.recalc-employee'
  | 'scoring.recalc-org-bulk'
  | 'evidence.expiry-scan'
  | 'snapshot.partition-maintenance'
  | 'notification.deliver'
  | 'observability.client-metrics';

export type RateLimit = {
  /** Maximum jobs per `duration` window. */
  max: number;
  /** Window length in milliseconds. */
  duration: number;
};

export type QueueDef = {
  /** Concurrency per worker process (multiply by replica count for total).
   *  Read by the consumer's `@Processor(queueName, { concurrency })` decorator
   *  argument — that's where BullMQ Worker options live. */
  concurrency: number;
  /** Max attempts before the job moves to the DLQ. */
  maxAttempts: number;
  /** Exponential or fixed backoff. BullMQ exponential uses
   *  `2^(attempt-1) * delayMs`, so a 1s base reaches ~17 minutes on
   *  attempt 10. The `maxBackoffMs` cap prevents the delay from
   *  overflowing setTimeout's 24-day limit on very-high-attempt queues. */
  backoff: { type: 'fixed' | 'exponential'; delayMs: number; maxBackoffMs?: number };
  /** Optional rate-limit applied at the Worker (`limiter` option) — keeps
   *  one tenant's bulk burst from starving interactive recalcs (Arch §7.4). */
  rateLimit?: RateLimit;
  /** Where failed-past-max-attempts jobs land. Convention: original queue
   *  name suffixed with `.dlq`. Set to null for best-effort queues where
   *  dropping is acceptable (e.g., client-metrics beacon). */
  dlq: string | null;
};

export const QUEUES: Record<QueueName, QueueDef> = {
  __smoke: {
    concurrency: 1,
    maxAttempts: 3,
    backoff: { type: 'fixed', delayMs: 50 },
    dlq: '__smoke.dlq',
  },
  // Arch §7.2 says "infinite" for the outbox relay — the operational signal
  // is the DLQ-depth Prometheus alert (Arch §11.4), not the retry counter.
  // We cap at 100 attempts with a 5-min backoff ceiling so a deterministically-
  // poisoned job DOES eventually surface in the DLQ for a human to inspect.
  // True infinite-retry with no DLQ would silently mask poison forever.
  'audit.outbox-relay': {
    concurrency: 2,
    maxAttempts: 100,
    backoff: { type: 'exponential', delayMs: 1_000, maxBackoffMs: 5 * 60 * 1_000 },
    dlq: 'audit.outbox-relay.dlq',
  },
  'scoring.recalc-employee': {
    concurrency: 8,
    maxAttempts: 5,
    backoff: { type: 'exponential', delayMs: 2_000 },
    dlq: 'scoring.recalc-employee.dlq',
  },
  'scoring.recalc-org-bulk': {
    concurrency: 2,
    maxAttempts: 5,
    backoff: { type: 'exponential', delayMs: 10_000 },
    rateLimit: { max: 20, duration: 1_000 },
    dlq: 'scoring.recalc-org-bulk.dlq',
  },
  'evidence.expiry-scan': {
    concurrency: 1,
    maxAttempts: 3,
    backoff: { type: 'exponential', delayMs: 5_000 },
    dlq: 'evidence.expiry-scan.dlq',
  },
  'snapshot.partition-maintenance': {
    concurrency: 1,
    maxAttempts: 3,
    backoff: { type: 'exponential', delayMs: 5_000 },
    dlq: 'snapshot.partition-maintenance.dlq',
  },
  'notification.deliver': {
    concurrency: 4,
    maxAttempts: 3,
    backoff: { type: 'exponential', delayMs: 2_000 },
    dlq: 'notification.deliver.dlq',
  },
  'observability.client-metrics': {
    concurrency: 2,
    maxAttempts: 2,
    backoff: { type: 'fixed', delayMs: 1_000 },
    dlq: null,
  },
};

/** Queues whose producer and/or consumer ship now. Future stories extend
 *  the set when they ship their producer/consumer. Stories shipping queues:
 *  4-1 → __smoke; 3-3 → audit.outbox-relay; 3-6 → snapshot.partition-maintenance. */
export const ACTIVE_QUEUES: readonly QueueName[] = [
  '__smoke',
  'audit.outbox-relay',
  'snapshot.partition-maintenance',
] as const;

/** Returns the DLQ name for a queue if it has one, else null. */
export function dlqOf(name: QueueName): string | null {
  return QUEUES[name].dlq;
}
