/**
 * Pure authorization predicates for evidence retrieval (Story 8-3).
 *
 * PRD §3.1 + AC2: a download is authorized iff the actor is one of
 *   • the EMPLOYEE who owns the evidence (their `User` is the
 *     `User` referenced by `Employee.userId`),
 *   • the subject employee's DIRECT manager (the actor has an active
 *     `EmployeeAssignment` shape that lists them as
 *     `managerEmployeeId` on the subject's own assignment),
 *   • an ADMIN of the actor's organization.
 *
 * The function is pure: callers pre-load the rows. No DB IO, no Nest
 * DI. This makes the authorization decision a unit-testable predicate
 * that the {@link EvidenceDownloadService} composes around its
 * `withOrgScope` lookup.
 *
 * Note: "ADMIN" sees all evidence within their org. The role check
 * implicitly relies on the upstream RLS sweep (every row read is
 * already org-scoped via `app.current_org_id`), so an ADMIN in org A
 * cannot reach evidence in org B even though their role string is
 * uniform.
 */

import type { ActorContext } from '../auth/actor-context.js';

/** Minimal shape of `Employee` needed for the owner check. The
 *  `userId` here is the FK to `User.id` (NOT the actor's id). */
export type OwnerEmployeeRef = { userId: string };

/** Minimal shape of `EmployeeAssignment`. Only the manager pointer
 *  and the active-flag matter for the manager check. */
export type AssignmentManagerRef = {
  managerEmployeeId: string | null;
  deactivatedAt: Date | null;
};

export type CanViewEvidenceInput = {
  actor: Pick<ActorContext, 'user_id' | 'role'>;
  /** Subject employee — the evidence's owner. */
  ownerEmployee: OwnerEmployeeRef;
  /** Actor's own employee row IN THE SAME ORG. Null when the actor
   *  is authenticated but has no Employee profile (e.g. an ADMIN
   *  who is not also an employee). The ADMIN branch resolves first
   *  so this null doesn't block them. */
  actorEmployee: { id: string } | null;
  /** Active assignments owned by the subject. The function inspects
   *  `managerEmployeeId`s to decide whether the actor's employee row
   *  is listed as a manager on any of them. */
  subjectAssignments: ReadonlyArray<AssignmentManagerRef>;
};

export type Authorization =
  | { allowed: true; via: 'OWNER' | 'MANAGER' | 'ADMIN' }
  | { allowed: false; reason: string };

export type ReviewAuthorization =
  | { allowed: true; via: 'DIRECT_MANAGER' | 'ADMIN_OVERRIDE' }
  | { allowed: false; reason: string };

/**
 * Story 8-5 — REVIEW authorization (approve / reject).
 *
 * Separate predicate from {@link authorizeEvidenceView} because the
 * rules diverge:
 *   • Owner is NOT allowed to review their own evidence (caught
 *     upstream by SelfApprovalGuard — `authorizeEvidenceReview` does
 *     NOT re-check this; the caller is expected to run the guard
 *     first, since a self-review needs the more specific 403
 *     `self_approval_not_allowed` error code, not the generic
 *     authz denial).
 *   • Direct manager of the subject is allowed (`via=DIRECT_MANAGER`).
 *   • ADMIN is allowed via the override path (`via=ADMIN_OVERRIDE`)
 *     regardless of whether they have an employee row in the org or
 *     a direct-manager relationship to the subject. This is the AC1
 *     `allow_admin_override` pass.
 *
 * The `via` value is what 8-5 AC2 surfaces in the audit event's
 * `actorRole` field so HR investigations can distinguish manager
 * decisions from admin-override decisions.
 */
export type CanReviewEvidenceInput = {
  actor: Pick<ActorContext, 'role'>;
  /** Actor's own employee row in this org. Null for ADMINs who
   *  don't have an employee profile. */
  actorEmployee: { id: string } | null;
  /** Active assignments owned by the subject — used to check whether
   *  the actor is listed as a direct manager. */
  subjectAssignments: ReadonlyArray<AssignmentManagerRef>;
};

export function authorizeEvidenceReview(
  input: CanReviewEvidenceInput,
): ReviewAuthorization {
  // ADMIN override first — short-circuits the manager-edge check
  // (ADMIN can review without being anyone's direct manager).
  if (input.actor.role === 'ADMIN') {
    return { allowed: true, via: 'ADMIN_OVERRIDE' };
  }
  // Direct manager: actor has an employee row AND at least one of
  // the subject's ACTIVE assignments lists that employee id as
  // managerEmployeeId. Deactivated assignments don't grant review
  // privileges (matches the view predicate's behavior).
  if (input.actorEmployee) {
    const actorEmpId = input.actorEmployee.id;
    const hasActiveManagerEdge = input.subjectAssignments.some(
      (a) => a.deactivatedAt === null && a.managerEmployeeId === actorEmpId,
    );
    if (hasActiveManagerEdge) {
      return { allowed: true, via: 'DIRECT_MANAGER' };
    }
  }
  return {
    allowed: false,
    reason: 'Not authorized to review this evidence (must be direct manager or ADMIN)',
  };
}

/**
 * Predicate. Returns a structured result so the caller can log
 * `via` on success (audit-trail attribution beyond just allowed/denied)
 * and surface `reason` on failure.
 */
export function authorizeEvidenceView(input: CanViewEvidenceInput): Authorization {
  // ADMIN first — short-circuits the row-shape requirements (an ADMIN
  // doesn't need to have an employee row in this org to view evidence).
  if (input.actor.role === 'ADMIN') {
    return { allowed: true, via: 'ADMIN' };
  }
  // Owner: actor's user_id matches the subject's User.
  if (input.ownerEmployee.userId === input.actor.user_id) {
    return { allowed: true, via: 'OWNER' };
  }
  // Direct manager: actor has an employee row, and at least one of
  // the subject's ACTIVE assignments lists that employee id as
  // managerEmployeeId. Inactive (deactivated) assignments don't
  // grant access — a former manager loses the privilege the moment
  // their assignment is deactivated.
  if (input.actorEmployee) {
    const actorEmpId = input.actorEmployee.id;
    const hasActiveManagerEdge = input.subjectAssignments.some(
      (a) => a.deactivatedAt === null && a.managerEmployeeId === actorEmpId,
    );
    if (hasActiveManagerEdge) {
      return { allowed: true, via: 'MANAGER' };
    }
  }
  return { allowed: false, reason: 'Not authorized to view this evidence' };
}
