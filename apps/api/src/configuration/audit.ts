import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import type { ActorContext } from '../auth/actor-context.js';

/**
 * Configuration-entity type tag used in the `configuration.changed`
 * outbox payload. Kept as a closed union here so a typo at a call site
 * fails at compile time rather than at relay-parse time.
 *
 * When Epic 7 adds new configuration surfaces (visibility rules,
 * approval workflows, rollout mode), extend this union — the
 * `safeParseAuditEvent` schema treats `configEntityType` as
 * `z.string().min(1)` so the wire format already allows it.
 */
export type ConfigEntityType =
  | 'career_track'
  | 'level'
  | 'layer'
  | 'requirement'
  | 'promotion_rule'
  | 'visibility_rule'
  | 'approval_workflow'
  | 'rollout_mode';

/**
 * Lifted from {@link import('./career-tracks.service.js').CareerTracksService}
 * and {@link import('./levels.service.js').LevelsService} as part of
 * Story 7-3 (follow-up F7-2b). Single source of truth for the
 * `configuration.changed` outbox payload shape — every configuration
 * mutation in Epic 7 routes through this helper so:
 *
 *   • the `field: '*'` whole-row sentinel stays consistent
 *   • `safeParseAuditEvent` from `@fcm/domain-contracts` accepts the
 *     payload (the relay would reject otherwise)
 *   • `serializeRow` is supplied by the caller because each entity
 *     has its own column set and Date→ISO conversion is the only
 *     transformation needed
 *
 * The helper MUST be called inside the same `withOrgScope` transaction
 * as the row write so audit and state cannot diverge under failure.
 * The caller's `tx` is the only Prisma client this function will use.
 *
 * Story 7-9 will layer `change_type` + `affected_employee_ids[]` on
 * top of this payload for bulk-recalc triggering; that field lands
 * here as a third optional `params` field.
 */
export async function emitConfigurationChanged<TRow>(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actor: ActorContext,
  params: {
    configEntityType: ConfigEntityType;
    /** The configuration row's own id (e.g. level.id). */
    entityId: string;
    /** Pre-mutation row state. `null` for CREATE. */
    before: TRow | null;
    /** Post-mutation row state. `null` for DELETE (hard or soft both pass `after = before-row-with-active=false`). */
    after: TRow | null;
    /** Caller-supplied serializer — returns a JSON-safe shape. Date
     *  fields MUST be ISO strings so the JSONB column stores a stable
     *  canonical representation. */
    serialize: (row: TRow) => Record<string, unknown>;
    /** Optional human reason (kept for parity with the audit-event
     *  schema; configuration changes generally don't carry one). */
    reason?: string | null;
  },
): Promise<void> {
  const payload: Prisma.InputJsonValue = {
    actorId: actor.user_id,
    reason: params.reason ?? null,
    before: {
      configEntityType: params.configEntityType,
      configEntityId: params.entityId,
      field: '*',
      beforeValue:
        params.before === null ? null : (params.serialize(params.before) as Prisma.InputJsonValue),
    },
    after: {
      afterValue:
        params.after === null ? null : (params.serialize(params.after) as Prisma.InputJsonValue),
    },
  };
  await tx.outboxEvent.create({
    data: {
      eventId: randomUUID(),
      organizationId,
      aggregateType: 'configuration',
      aggregateId: params.entityId,
      eventType: 'configuration.changed',
      payload,
    },
  });
}

/** Convenience: convert any Date fields on an object to ISO strings.
 *  Use inside a `serialize` callback when the row's shape is simple
 *  enough that explicit per-field serialization adds no value. */
export function isoDates<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/**
 * Emit one `visibility_rule.changed` outbox event (Story 7-6, PRD §8.6).
 *
 * Distinct from `configuration.changed` because the audit schema is
 * different (`before.fromSetting` + `after.toSetting` vs.
 * `before.beforeValue` + `after.afterValue`), AND because the Map
 * Data Contract (Epic 10) will filter on this event type specifically
 * to invalidate cached projections. Using a dedicated event type
 * lets the map cache subscribe narrowly instead of grepping the
 * generic `configuration.changed` stream.
 *
 * The relay (Story 3-3) consumes the same outbox row and persists it
 * to `audit_events` with `entityType: 'visibility_rule'`,
 * `entityId: <organizationId>`.
 */
export async function emitVisibilityRuleChanged(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actor: ActorContext,
  params: {
    fromSetting: 'OWN_ONLY' | 'TEAM' | 'ORG_SUMMARY' | 'ORG_FULL';
    toSetting: 'OWN_ONLY' | 'TEAM' | 'ORG_SUMMARY' | 'ORG_FULL';
    reason?: string | null;
  },
): Promise<void> {
  const payload: Prisma.InputJsonValue = {
    actorId: actor.user_id,
    reason: params.reason ?? null,
    before: { fromSetting: params.fromSetting },
    after: { toSetting: params.toSetting },
  };
  await tx.outboxEvent.create({
    data: {
      eventId: randomUUID(),
      organizationId,
      aggregateType: 'visibility_rule',
      aggregateId: organizationId,
      eventType: 'visibility_rule.changed',
      payload,
    },
  });
}
