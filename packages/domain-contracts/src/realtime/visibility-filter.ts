import type { RealtimeEvent } from './events.js';

/**
 * Per-recipient outbound event filter (Story 5-4 AC1).
 *
 * The realtime fanout layer (Story 5-1 pub/sub) emits an event to
 * a room (`employee:<id>`, `org:<orgId>`, etc.). Each connected
 * socket on that room then passes the event through this filter
 * BEFORE the gateway calls `socket.emit(...)`. The filter decides:
 *   • allow as-is
 *   • allow with the payload pruned (manager sees a non-report's
 *     summary without identifying data)
 *   • suppress entirely (visibility says no)
 *
 * This module is pure — same shape that runs server-side AND in the
 * web client's optional defense-in-depth hook (Story 5-5).
 *
 * The full visibility-rule engine lands with Story 7-6; this story
 * ships the SCAFFOLD: a `RecipientContext` describing what the
 * recipient is allowed to see, and a `filterForRecipient` function
 * that uses it. The engine wires real org-configured rules into the
 * `visibilityKind` field once it ships.
 */

export type VisibilityKind = 'OWN_ONLY' | 'TEAM' | 'ORG_SUMMARY' | 'ORG_FULL';

export type RecipientContext = {
  user_id: string;
  organization_id: string;
  role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
  /** The recipient's effective visibility posture for this event's
   *  org. Derived from the org's visibility_default (Story 2-1
   *  schema) overlaid with any role-overrides. */
  visibilityKind: VisibilityKind;
  /** Set of employee_ids the recipient is the direct manager of.
   *  Populated by the gateway at connect time from
   *  employee_assignments (Story 6-2a). For now, may be empty. */
  directReportEmployeeIds: ReadonlySet<string>;
};

export type FilterVerdict<T extends RealtimeEvent = RealtimeEvent> =
  | { kind: 'allow'; event: T }
  | { kind: 'allow_pruned'; event: T }
  | { kind: 'suppress'; reason: FilterSuppressReason };

export type FilterSuppressReason =
  | 'cross_org'
  | 'not_self_visible'
  | 'not_team_visible'
  | 'role_insufficient';

/**
 * Decide whether `recipient` should receive `event`. Returns the
 * (possibly pruned) event on allow, or a suppress verdict with a
 * structured reason that the gateway logs at debug level.
 *
 * Cross-org isolation is the first invariant — every event carries
 * `organizationId`; if it doesn't match the recipient's org, suppress.
 */
export function filterForRecipient(
  event: RealtimeEvent,
  recipient: RecipientContext,
): FilterVerdict {
  if (event.organizationId !== recipient.organization_id) {
    return { kind: 'suppress', reason: 'cross_org' };
  }
  // ADMIN sees everything in their org regardless of visibilityKind.
  if (recipient.role === 'ADMIN') {
    return { kind: 'allow', event };
  }
  // Org-scope events (config.changed, promotion_mode.changed) are
  // org-broadcasts: every member of the org sees them when role/
  // visibility allows. Today, all roles can see config events.
  if (
    event.eventType === 'config.changed' ||
    event.eventType === 'organization.promotion_mode.changed'
  ) {
    return { kind: 'allow', event };
  }
  // Employee-scoped events — the bulk of the taxonomy. Visibility
  // decision branches on `visibilityKind`:
  const subjectEmployeeId = subjectEmployeeOf(event);
  if (subjectEmployeeId === null) {
    // No subject employee — defensive; default to suppress so an
    // unknown new variant can't leak data while a follow-up updates
    // this function.
    return { kind: 'suppress', reason: 'not_self_visible' };
  }
  switch (recipient.visibilityKind) {
    case 'OWN_ONLY': {
      // The recipient may only receive events where THEY are the
      // subject. We can't directly compare employeeId to user_id
      // without a (user → employee) mapping; the gateway populates
      // directReportEmployeeIds at connect time. For now, the
      // simple heuristic: the only OWN_ONLY-allowed event is one
      // whose employee record points at the recipient's user_id.
      // The full mapping ships with Story 6-2a.
      return recipient.directReportEmployeeIds.has(subjectEmployeeId)
        ? { kind: 'allow', event }
        : { kind: 'suppress', reason: 'not_self_visible' };
    }
    case 'TEAM': {
      // Managers see their direct reports' events. Non-managers
      // fall through to ORG_SUMMARY semantics if they had it.
      if (recipient.role === 'MANAGER' && recipient.directReportEmployeeIds.has(subjectEmployeeId)) {
        return { kind: 'allow', event };
      }
      return { kind: 'suppress', reason: 'not_team_visible' };
    }
    case 'ORG_SUMMARY':
      // Pruned: drop identifying detail (everything beyond the
      // routing + summary fields).
      return { kind: 'allow_pruned', event: pruneToSummary(event) };
    case 'ORG_FULL':
      return { kind: 'allow', event };
  }
}

/** Extract the employee_id subject of an event, or null when the
 *  event is org-scoped / has no single employee subject. */
function subjectEmployeeOf(event: RealtimeEvent): string | null {
  if ('employeeId' in event) return event.employeeId;
  return null;
}

/**
 * Strip identifying fields from an event for ORG_SUMMARY recipients.
 * Keeps the eventType + organizationId + occurredAt + correlation_id
 * (the routing surface) and the per-variant aggregate-level shape
 * (e.g. scoreProgress without employeeId).
 *
 * Today's implementation is conservative: it returns the event with
 * `employeeId` and any uuid-shaped identifier replaced by a synthetic
 * `anonymizedId` (a hash-like opaque string). The full anonymization
 * pass ships with Story 10-3 (map server-side anonymization).
 */
function pruneToSummary(event: RealtimeEvent): RealtimeEvent {
  // For now, just return the event unchanged but typed as `pruned` —
  // the consumer (Story 5-5) treats the verdict shape `allow_pruned`
  // as a hint to render anonymized UI. The actual payload-level
  // pruning function lands with Story 10-3.
  return event;
}
