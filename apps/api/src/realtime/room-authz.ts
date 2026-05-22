import type { ActorContext } from '../auth/actor-context.js';

/**
 * Room join authorization (Story 5-3, Arch §8.2 + §8.5).
 *
 * Four room kinds:
 *   • `user:<userId>`           — caller must BE that user
 *   • `org:<orgId>`             — caller must be ADMIN in that org
 *   • `employee:<employeeId>`   — self, direct manager, or ADMIN
 *   • `manager-team:<userId>`   — caller must BE that manager OR ADMIN
 *
 * The employee + manager-team rooms require manager-team data that
 * lives on `employee_assignments` (Story 6-2a). Until that table
 * ships, the authorization function accepts an `isDirectManager(...)`
 * callback the caller wires from a domain service — this story
 * provides the structural decision logic; the data plumbing lands
 * with Epic 6.
 *
 * Cross-org isolation: every room id carries an org-scoped uuid.
 * For `org:` rooms the caller's organization_id MUST match the room
 * id. For other rooms the caller's organization_id is opaque to the
 * authorization function; the calling service performs an org-scoped
 * lookup before invoking the callback.
 */

export type RoomKind = 'user' | 'org' | 'employee' | 'manager-team';

export type ParsedRoom = { kind: RoomKind; id: string };

export type RoomAuthzVerdict =
  | { allowed: true }
  | { allowed: false; reason: RoomAuthzRejectReason };

export type RoomAuthzRejectReason =
  | 'malformed_room'
  | 'unknown_kind'
  | 'cross_org'
  | 'not_self'
  | 'not_admin'
  | 'not_visible';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse `kind:id` into a tagged room. Returns null on any malformed
 * input (wrong shape, unknown kind, non-uuid id).
 */
export function parseRoom(room: string): ParsedRoom | null {
  if (typeof room !== 'string') return null;
  const sep = room.indexOf(':');
  if (sep < 0 || sep === room.length - 1) return null;
  const kind = room.slice(0, sep);
  const id = room.slice(sep + 1);
  if (!UUID_RE.test(id)) return null;
  if (kind === 'user' || kind === 'org' || kind === 'employee' || kind === 'manager-team') {
    return { kind, id };
  }
  return null;
}

export type EmployeeContextProbe = {
  /** Returns true when the room's `employee:<id>` row exists AND the
   *  caller is its direct manager (employee_assignments.manager_user_id
   *  = caller.user_id). False otherwise — including when the employee
   *  doesn't exist; the caller's only signal is "permitted yes/no".
   *  Async because it typically queries the DB. */
  isDirectManagerOf: (subjectEmployeeId: string) => Promise<boolean>;
  /** Returns the user_id that the subject `employee:<id>` row points
   *  at (employees.user_id). Used to decide the self-only branch.
   *  Returns null when the employee doesn't exist. */
  employeeUserId: (subjectEmployeeId: string) => Promise<string | null>;
};

/**
 * Decide whether `actor` may join `room`. Static rules (self / role
 * checks) run synchronously; the `employee:` branch needs DB context
 * supplied via `probe`.
 *
 * NOTE: `probe` is only consulted for `employee:` rooms. The other
 * three kinds are static.
 */
export async function authorizeRoomJoin(
  actor: ActorContext,
  room: string,
  probe?: EmployeeContextProbe,
): Promise<RoomAuthzVerdict> {
  const parsed = parseRoom(room);
  if (!parsed) {
    return { allowed: false, reason: 'malformed_room' };
  }
  switch (parsed.kind) {
    case 'user':
      // AC1: client joining user:{id} must BE that user.
      return parsed.id === actor.user_id
        ? { allowed: true }
        : { allowed: false, reason: 'not_self' };

    case 'org':
      // AC2: org:* requires ADMIN AND the room id must match the
      // caller's organization_id (no cross-org room joins).
      if (parsed.id !== actor.organization_id) {
        return { allowed: false, reason: 'cross_org' };
      }
      return actor.role === 'ADMIN'
        ? { allowed: true }
        : { allowed: false, reason: 'not_admin' };

    case 'employee': {
      // AC3: employee:{id} — self, direct manager, or ADMIN. ADMIN
      // passes regardless of org (the controller layer scopes the
      // lookup; cross-org employee_ids would simply not resolve).
      if (actor.role === 'ADMIN') {
        return { allowed: true };
      }
      if (!probe) {
        // No probe wired — can't decide self/manager. Deny closed-fail.
        return { allowed: false, reason: 'not_visible' };
      }
      const subjectUserId = await probe.employeeUserId(parsed.id);
      if (subjectUserId === actor.user_id) {
        return { allowed: true };
      }
      const isManager = await probe.isDirectManagerOf(parsed.id);
      return isManager ? { allowed: true } : { allowed: false, reason: 'not_visible' };
    }

    case 'manager-team':
      // AC4: manager-team:{userId} — caller must BE that manager or ADMIN.
      if (actor.role === 'ADMIN') {
        return { allowed: true };
      }
      return parsed.id === actor.user_id
        ? { allowed: true }
        : { allowed: false, reason: 'not_self' };
  }
}
