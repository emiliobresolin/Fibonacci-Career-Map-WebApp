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
