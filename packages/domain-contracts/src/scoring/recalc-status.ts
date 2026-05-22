import { z } from 'zod';

/**
 * Recalculation-status state machine (Story 4-6, Arch §5.2, FR-5.12).
 *
 * Every employee carries a recalc status that the UI uses to gate
 * rendering of "fresh" vs "pending" vs "stale" data:
 *
 *   • `idle`      — no recalc in flight; the last persisted snapshot
 *                   is the source of truth.
 *   • `pending`   — a recalc has been enqueued and is in flight (BullMQ
 *                   job is `waiting` or `active`). The UI shows the
 *                   previous snapshot with a "Recalculating…" hint.
 *   • `completed` — recalc finished successfully; the new snapshot is
 *                   the source of truth. The status transitions back
 *                   to `idle` on the next render cycle (or stays
 *                   `completed` until the next enqueue, depending on
 *                   the consumer's choice).
 *   • `stale`     — pending job has exceeded the SLA window without
 *                   completing. The UI shows the previous snapshot
 *                   with a "may be out of date" warning + a refresh
 *                   affordance.
 *
 * The transition function `nextStatus(current, event, ageMs?)` is pure
 * + side-effect-free so it can run on the server (orchestrator) AND
 * the client (UI rendering decisions) with identical semantics.
 */

export const EmployeeRecalcStatusSchema = z.enum(['idle', 'pending', 'completed', 'stale']);
export type EmployeeRecalcStatus = z.infer<typeof EmployeeRecalcStatusSchema>;

export const RECALC_STATUS_VALUES = EmployeeRecalcStatusSchema.options;

/**
 * Events the state machine accepts. `tick` is the time-based transition
 * used by the UI/orchestrator to surface `stale` when a `pending` job
 * has exceeded its SLA; the caller passes `ageMs` (time since the
 * pending job was enqueued).
 */
export type RecalcStatusEvent =
  | { kind: 'enqueued' }
  | { kind: 'completed' }
  | { kind: 'failed' }
  | { kind: 'tick'; ageMs: number };

export type NextStatusOptions = {
  /** Stale SLA in milliseconds. Default 60_000 (60s per FR-5.12). */
  staleAfterMs?: number;
};

export const DEFAULT_STALE_AFTER_MS = 60_000;

/**
 * Pure transition function. Returns the next status given the current
 * one + event. Always returns a valid status; unknown / impossible
 * transitions return the current status unchanged so a stale UI tick
 * doesn't drag the visible state backward.
 */
export function nextStatus(
  current: EmployeeRecalcStatus,
  event: RecalcStatusEvent,
  options: NextStatusOptions = {},
): EmployeeRecalcStatus {
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  switch (event.kind) {
    case 'enqueued':
      // Any non-pending status transitions to pending on a fresh
      // enqueue. A pending-on-pending is a no-op (one in-flight job
      // per employee is the orchestrator's invariant; duplicates are
      // dropped by the recalc_jobs idempotency table from Story 4-3).
      return 'pending';

    case 'completed':
      // Only `pending` → `completed` is a legal completion. A
      // completion event arriving on an idle/stale state is a stale
      // notification (the orchestrator already processed the next
      // job) — keep the current status.
      return current === 'pending' ? 'completed' : current;

    case 'failed':
      // Failure on a pending recalc means the recalc didn't update
      // the snapshot. The UI returns to `idle` so the previous
      // snapshot is treated as the source of truth; the BullMQ DLQ
      // (Story 4-5) carries the failure for operator triage. Any
      // other current state is unaffected.
      return current === 'pending' ? 'idle' : current;

    case 'tick':
      // Time-based transition: only `pending` can become `stale`,
      // and only when the age exceeds the SLA. The threshold uses
      // strict `>` so the boundary tick keeps `pending`.
      if (current === 'pending' && event.ageMs > staleAfterMs) {
        return 'stale';
      }
      return current;
  }
}
