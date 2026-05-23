/**
 * Evidence lifecycle state machine (Story 8-1, Arch §6.2, PRD FR-4.4).
 *
 * This module is the SINGLE authority on which evidence-state transitions
 * are legal. The DB carries the {@link EvidenceState} enum (see Prisma
 * schema + the 20260531000000_evidence_state_machine migration) and the
 * `evidence_approved_at_consistency` CHECK constraint, but it deliberately
 * does NOT enforce the transition graph itself — that would require a
 * stateful BEFORE UPDATE trigger reading OLD/NEW per row, with its own
 * test surface. Instead every service that mutates an evidence row in a
 * later story (8-2 finalize, 8-4 approve/reject, 8-6 retroactive
 * rejection, 8-7 expiry cron) calls into {@link EvidenceStateMachine}
 * before the write, and the write is co-committed in the standard
 * `withOrgScope(prisma, orgId, async tx => ...)` transaction so the row
 * write + outbox emission + audit event land atomically.
 *
 * Legal transitions (PRD §6.2 / §6.3 + Arch §9.1 / §7.5 + FR-4.7 / 4.8):
 *   DRAFT             → PENDING_APPROVAL  (employee finalize)
 *   PENDING_APPROVAL  → APPROVED          (manager / admin / HR approve)
 *   PENDING_APPROVAL  → REJECTED          (manager / admin / HR reject)
 *   APPROVED          → REJECTED          (retroactive rejection, FR-4.7)
 *   APPROVED          → EXPIRED           (expiry cron, FR-4.8)
 *
 * Everything else — including self-transitions (X → X) — is illegal and
 * raises {@link IllegalEvidenceTransitionError}. In particular:
 *   • REJECTED → PENDING_APPROVAL is NOT a legal transition: a
 *     resubmission creates a NEW evidence row so the rejected row
 *     remains intact for audit (PRD §6.3 "Employee may resubmit revised
 *     evidence" interpreted as a new submission, not a state flip).
 *   • EXPIRED is terminal: re-submitting against the same requirement
 *     after expiry creates a new evidence row.
 *   • DRAFT → APPROVED / REJECTED / EXPIRED is illegal: only submitted
 *     evidence can be reviewed, only approved evidence can expire.
 *
 * The module is pure (no Nest DI, no IO) so it can be imported from
 * services, consumers, and tests without bootstrapping a module
 * container. Both a predicate API (`canTransition`) and a throwing API
 * (`assertCanTransition`) are exported — callers in a request-handler
 * path prefer `assertCanTransition` so an illegal transition surfaces
 * as a structured error before the DB write; UI projections that need
 * to render "actions available on this row" prefer `canTransition`.
 */

/** Every state the lifecycle can occupy. Mirrors Prisma's `EvidenceState`
 *  enum exactly so this module can accept Prisma payloads directly
 *  without an adapter. */
export const EVIDENCE_STATES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;

export type EvidenceState = (typeof EVIDENCE_STATES)[number];

/** Legal (from, to) edges. Frozen-tuple shape so callers can iterate
 *  for UI surfaces ("what can I do with this row right now?") without
 *  duplicating the transition table. */
export const LEGAL_EVIDENCE_TRANSITIONS = [
  ['DRAFT', 'PENDING_APPROVAL'],
  ['PENDING_APPROVAL', 'APPROVED'],
  ['PENDING_APPROVAL', 'REJECTED'],
  ['APPROVED', 'REJECTED'],
  ['APPROVED', 'EXPIRED'],
] as const satisfies ReadonlyArray<readonly [EvidenceState, EvidenceState]>;

export type EvidenceTransition = (typeof LEGAL_EVIDENCE_TRANSITIONS)[number];

/** O(1) lookup table built from {@link LEGAL_EVIDENCE_TRANSITIONS}. Kept
 *  module-private so callers can't mutate the source of truth. */
const LEGAL_EDGES: ReadonlySet<string> = new Set(
  LEGAL_EVIDENCE_TRANSITIONS.map(([from, to]) => `${from}->${to}`),
);

/**
 * Structured error raised when a caller asks for an illegal transition.
 *
 * The `code` field is the stable string downstream callers branch on
 * (the existing service layer in the configuration module raises
 * `HttpException` with a string `code` — same convention here). `from`
 * and `to` carry the exact transition that was rejected so audit /
 * error-log readers can reconstruct the attempt without re-parsing
 * the message string.
 */
export class IllegalEvidenceTransitionError extends Error {
  readonly code = 'ILLEGAL_EVIDENCE_TRANSITION' as const;
  readonly from: EvidenceState;
  readonly to: EvidenceState;

  constructor(from: EvidenceState, to: EvidenceState) {
    super(`Illegal evidence transition: ${from} -> ${to}`);
    this.name = 'IllegalEvidenceTransitionError';
    this.from = from;
    this.to = to;
  }
}

/**
 * Pure predicate / assertion surface over the evidence transition graph.
 *
 * Implemented as a frozen object literal rather than a class so callers
 * import the surface directly (`EvidenceStateMachine.canTransition(...)`)
 * without instantiating it. The graph is closed at module load — adding
 * a transition requires editing {@link LEGAL_EVIDENCE_TRANSITIONS}.
 */
export const EvidenceStateMachine = Object.freeze({
  /** True if (from -> to) is in the legal transition table. */
  canTransition(from: EvidenceState, to: EvidenceState): boolean {
    return LEGAL_EDGES.has(`${from}->${to}`);
  },

  /** Throws {@link IllegalEvidenceTransitionError} when the transition
   *  is rejected. Returns void on success. */
  assertCanTransition(from: EvidenceState, to: EvidenceState): void {
    if (!LEGAL_EDGES.has(`${from}->${to}`)) {
      throw new IllegalEvidenceTransitionError(from, to);
    }
  },

  /** All legal `to` states reachable from `from` (empty for terminal
   *  states REJECTED / EXPIRED). Useful for UI projections deciding
   *  which actions to surface. */
  legalNextStates(from: EvidenceState): readonly EvidenceState[] {
    return LEGAL_EVIDENCE_TRANSITIONS.filter(([f]) => f === from).map(([, t]) => t);
  },
});
