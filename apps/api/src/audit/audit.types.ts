import type { AuditEventType } from '@fcm/domain-contracts';

/** Bearer-token claims this controller cares about. Lives here until
 *  Story 2-4 ships the global AuthGuard + ActorContext primitive. */
export type ActorClaims = {
  sub: string;
  organizationId: string;
  role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
};

/** Query parameters accepted by GET /v1/audit-events. */
export type AuditListQuery = {
  actorId?: string;
  eventType?: AuditEventType;
  entityType?: string;
  entityId?: string;
  occurredFrom?: string;
  occurredTo?: string;
  cursor?: string;
  limit?: number;
};

/** One row in the read API response. Mirrors audit_events shape minus
 *  any DB-only metadata; intentionally lean so consumers can rely on a
 *  stable serialization. */
export type AuditEventRow = {
  id: string;
  organizationId: string;
  actorId: string | null;
  eventType: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  occurredAt: string;
};

export type AuditListResponse = {
  items: AuditEventRow[];
  /** Opaque cursor — pass back as `cursor` to fetch the next page. Absent
   *  when the current page is the last one. */
  nextCursor: string | null;
};
