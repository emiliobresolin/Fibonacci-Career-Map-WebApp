import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import type { ActorClaims, AuditEventRow, AuditListQuery, AuditListResponse } from './audit.types.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Audit read service (Story 3-5).
 *
 * Cursor-paginated list + CSV streaming. RBAC scoping is applied via the
 * `actor` argument so the controller doesn't have to know per-role
 * filter shape.
 *
 * Cross-org isolation is the load-bearing invariant — EVERY query filters
 * `organization_id = actor.organizationId` regardless of role. RLS from
 * Story 2-6 will layer on top as defense-in-depth.
 *
 * MANAGER team-scoping is currently identical to EMPLOYEE (self-only) —
 * the employee/team relationship tables ship in EPIC-6+. When
 * employee_assignments lands, replace the self-only clause with a JOIN
 * on the manager → direct-reports tree.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(actor: ActorClaims, query: AuditListQuery): Promise<AuditListResponse> {
    const limit = clampLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const { sql, params } = buildSelect(actor, query, cursor, limit + 1);
    const rows = await this.prisma.$queryRawUnsafe<RawAuditRow[]>(sql, ...params);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(rowToApi);
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.occurredAt, last.id) : null;
    return { items, nextCursor };
  }

  /**
   * Streams CSV rows as an async iterable so the controller can pipe
   * directly into the HTTP response without buffering the whole result.
   * Same filters + RBAC as `list()`; pages internally so an unbounded
   * export doesn't pull every row into memory at once.
   */
  async *exportCsv(actor: ActorClaims, query: AuditListQuery): AsyncIterable<string> {
    yield 'id,occurred_at,organization_id,actor_id,event_type,entity_type,entity_id,reason\n';
    const PAGE = Math.min(MAX_LIMIT, 500);
    let cursor: string | undefined;
    while (true) {
      const pageQuery: AuditListQuery = { ...query, limit: PAGE };
      if (cursor !== undefined) pageQuery.cursor = cursor;
      const page = await this.list(actor, pageQuery);
      for (const row of page.items) {
        yield toCsvRow(row);
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
  }
}

type RawAuditRow = {
  id: string;
  organization_id: string;
  actor_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  occurred_at: Date;
};

type ParsedCursor = { occurredAt: string; id: string };

function buildSelect(
  actor: ActorClaims,
  query: AuditListQuery,
  cursor: ParsedCursor | null,
  limit: number,
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const bind = (value: unknown, cast?: string): string => {
    params.push(value);
    return cast ? `$${params.length}::${cast}` : `$${params.length}`;
  };

  // Cross-org isolation — first, non-negotiable.
  clauses.push(`"organization_id" = ${bind(actor.organizationId, 'uuid')}`);

  // RBAC scope.
  if (actor.role === 'EMPLOYEE' || actor.role === 'MANAGER') {
    // Self-only for now. MANAGER team-scoping awaits employee_assignments
    // table (EPIC-6+); see service-level comment.
    const sub1 = bind(actor.sub, 'uuid');
    const sub2 = bind(actor.sub, 'uuid');
    clauses.push(`("actor_id" = ${sub1} OR "entity_id" = ${sub2})`);
  }
  // ADMIN: no additional scope clause — sees everything in the org.

  if (query.actorId) clauses.push(`"actor_id" = ${bind(query.actorId, 'uuid')}`);
  if (query.eventType) clauses.push(`"event_type" = ${bind(query.eventType)}`);
  if (query.entityType) clauses.push(`"entity_type" = ${bind(query.entityType)}`);
  if (query.entityId) clauses.push(`"entity_id" = ${bind(query.entityId, 'uuid')}`);
  if (query.occurredFrom) clauses.push(`"occurred_at" >= ${bind(query.occurredFrom, 'timestamptz')}`);
  if (query.occurredTo) clauses.push(`"occurred_at" <= ${bind(query.occurredTo, 'timestamptz')}`);

  if (cursor) {
    const tsBind = bind(cursor.occurredAt, 'timestamptz');
    const idBind = bind(cursor.id, 'uuid');
    clauses.push(`("occurred_at", "id") < (${tsBind}, ${idBind})`);
  }

  const sql = `
    SELECT "id", "organization_id", "actor_id", "event_type", "entity_type",
           "entity_id", "before", "after", "reason", "occurred_at"
      FROM "audit_events"
     WHERE ${clauses.join(' AND ')}
     ORDER BY "occurred_at" DESC, "id" DESC
     LIMIT ${limit}
  `;
  return { sql, params };
}

function rowToApi(row: RawAuditRow): AuditEventRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    reason: row.reason,
    before: row.before,
    after: row.after,
    occurredAt: row.occurred_at.toISOString(),
  };
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(raw), MAX_LIMIT);
}

function encodeCursor(occurredAt: string, id: string): string {
  return Buffer.from(`${occurredAt}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): ParsedCursor | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [occurredAt, id] = decoded.split('|');
    if (!occurredAt || !id) return null;
    if (Number.isNaN(Date.parse(occurredAt))) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

function toCsvRow(row: AuditEventRow): string {
  const esc = (v: string | null): string => {
    if (v === null) return '';
    if (/[,"\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return [
    row.id,
    row.occurredAt,
    row.organizationId,
    row.actorId,
    row.eventType,
    row.entityType,
    row.entityId,
    esc(row.reason),
  ]
    .map((v, i) => (i === 7 ? (v ?? '') : esc((v as string) ?? null)))
    .join(',') + '\n';
}
