import type { ActorContext } from './actor-context.js';

/**
 * Raised by `SelfApprovalGuard.ensureNotSelf` when the acting user tries
 * to approve / decide / sign-off on something whose subject is themselves.
 *
 * Carries both ids in machine-readable form so audit + alert pipelines
 * can correlate the attempt without re-parsing the message. The HTTP
 * filter layer (out of scope here — added when the first endpoint adopts
 * this guard) maps the error to a `403 self_approval_not_allowed` body.
 */
export class SelfApprovalNotAllowedError extends Error {
  readonly code = 'SELF_APPROVAL_NOT_ALLOWED' as const;
  readonly actorUserId: string;
  readonly subjectUserId: string;

  constructor(actorUserId: string, subjectUserId: string) {
    super(`Actor ${actorUserId} cannot act on their own resource (subject ${subjectUserId})`);
    this.name = 'SelfApprovalNotAllowedError';
    this.actorUserId = actorUserId;
    this.subjectUserId = subjectUserId;
    // Preserve the prototype chain for `instanceof` after transpilation.
    Object.setPrototypeOf(this, SelfApprovalNotAllowedError.prototype);
  }
}

/**
 * Self-approval guard (Arch §10.3 Layer 2, PRD §9.2, Story 2-5 AC2).
 *
 * The architectural rule: **no actor may approve, decide, or otherwise
 * act on a resource whose subject is themselves.** This applies to
 *
 *   • evidence approval / rejection
 *   • promotion recommendation + decision
 *   • calibration flag resolution against one's own evidence
 *
 * Implemented as a stateless static method rather than an injectable
 * NestJS guard so it composes inside service methods *after* domain
 * preconditions have run — the failure should produce a 403 with the
 * domain context attached, not a generic auth failure. Domain services
 * call this guard inline:
 *
 *   SelfApprovalGuard.ensureNotSelf(actor, evidence.employeeId);
 *
 * Whitespace + empty-string defence is deliberate: a controller passing
 * `''` for `subjectUserId` indicates a programming bug, and treating it
 * as "not self" would silently allow the action.
 */
export class SelfApprovalGuard {
  /**
   * Throws `SelfApprovalNotAllowedError` when `actor.user_id` matches
   * `subjectUserId`. No-op otherwise. Comparison is exact-equality on
   * the raw uuid strings — both are sourced from canonical Postgres
   * uuids and never lower/upper-cased.
   */
  static ensureNotSelf(actor: ActorContext, subjectUserId: string): void {
    if (!actor || typeof actor.user_id !== 'string' || actor.user_id.length === 0) {
      // Calling code is responsible for passing a fully-formed ActorContext.
      // A missing or empty `actor.user_id` would silently mask the self-check
      // (`undefined === 'xxx'` is always false), so surface loudly.
      throw new TypeError('SelfApprovalGuard.ensureNotSelf: actor.user_id must be a non-empty string');
    }
    if (typeof subjectUserId !== 'string' || subjectUserId.length === 0) {
      // Calling code is responsible for resolving the subject's user_id
      // BEFORE invoking the guard. A missing / empty id is a contract
      // violation, not a self-approval question — surface it loudly.
      throw new TypeError('SelfApprovalGuard.ensureNotSelf: subjectUserId must be a non-empty string');
    }
    if (actor.user_id === subjectUserId) {
      throw new SelfApprovalNotAllowedError(actor.user_id, subjectUserId);
    }
  }
}
