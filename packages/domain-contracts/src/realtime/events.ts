import { z } from 'zod';

/**
 * Realtime event contracts (Story 5-4, Arch §8.3 + §8.5).
 *
 * Every event the FCM Socket.IO server emits is described here as a
 * Zod discriminated union. The emitter side (audit-relay → Story 5-1
 * pub/sub fanout) validates before publish; the consumer side (web
 * client hook → Story 5-5) validates on receive. Either layer can
 * detect a contract drift the other introduced.
 *
 * Naming convention mirrors the audit-event taxonomy: `<entity>.<verb>`.
 *
 * Each event carries the routing fields:
 *   • `eventType`        — discriminator key
 *   • `organizationId`   — tenant scope (consumers reject mismatches)
 *   • `occurredAt`       — ISO timestamp of the business event
 *   • `correlation_id`   — same value as the originating HTTP request /
 *                          job log line (cross-protocol tracing)
 * plus per-variant payload fields.
 */

const UuidSchema = z.string().uuid();
const IsoDateSchema = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO-8601 timestamp');

const RealtimeBaseSchema = z.object({
  organizationId: UuidSchema,
  occurredAt: IsoDateSchema,
  correlation_id: z.string().min(1),
});

// ─── snapshot.updated ───────────────────────────────────────────────
// Emitted when an employee's score_snapshot row changes. Targets
// the `employee:<id>` room AND `user:<userId>` room (the employee
// themselves).

export const SnapshotUpdatedSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('snapshot.updated'),
  employeeId: UuidSchema,
  /** Compact summary — the full snapshot lands via REST refetch. */
  summary: z.object({
    scoreProgress: z.number(),
    readinessPercent: z.number(),
    promotionEligible: z.boolean(),
  }),
});

// ─── evidence.* ─────────────────────────────────────────────────────

export const EvidenceSubmittedRealtimeSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('evidence.submitted'),
  evidenceId: UuidSchema,
  employeeId: UuidSchema,
  requirementId: UuidSchema,
});

export const EvidenceApprovedRealtimeSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('evidence.approved'),
  evidenceId: UuidSchema,
  employeeId: UuidSchema,
});

export const EvidenceRejectedRealtimeSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('evidence.rejected'),
  evidenceId: UuidSchema,
  employeeId: UuidSchema,
});

// ─── promotion.* ────────────────────────────────────────────────────

export const PromotionInitiatedRealtimeSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('promotion.initiated'),
  promotionId: UuidSchema,
  employeeId: UuidSchema,
});

export const PromotionDecidedRealtimeSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('promotion.decided'),
  promotionId: UuidSchema,
  employeeId: UuidSchema,
  decision: z.enum(['APPROVED', 'REJECTED']),
});

export const PromotionCompletedRealtimeSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('promotion.completed'),
  promotionId: UuidSchema,
  employeeId: UuidSchema,
});

// ─── recalc.* ───────────────────────────────────────────────────────
// Drives the EmployeeRecalcStatus state machine (Story 4-6) on the
// client side without requiring a REST poll for each transition.

export const RecalcPendingRealtimeSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('recalc.pending'),
  employeeId: UuidSchema,
  triggeringEventId: UuidSchema,
});

export const RecalcCompletedRealtimeSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('recalc.completed'),
  employeeId: UuidSchema,
  triggeringEventId: UuidSchema,
});

export const RecalcFailedRealtimeSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('recalc.failed'),
  employeeId: UuidSchema,
  triggeringEventId: UuidSchema,
  reason: z.string().min(1),
});

// ─── config.changed + organization.promotion_mode.changed ──────────

export const ConfigChangedRealtimeSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('config.changed'),
  configurationAggregate: z.enum([
    'career_track',
    'level',
    'layer',
    'requirement',
    'promotion_rule',
    'visibility_rule',
    'approval_workflow',
  ]),
  aggregateId: UuidSchema,
});

export const PromotionModeChangedRealtimeSchema = RealtimeBaseSchema.extend({
  eventType: z.literal('organization.promotion_mode.changed'),
  before: z.enum(['CALIBRATION', 'ACTIVE']),
  after: z.enum(['CALIBRATION', 'ACTIVE']),
});

// ─── Discriminated union ───────────────────────────────────────────

export const RealtimeEventSchema = z.discriminatedUnion('eventType', [
  SnapshotUpdatedSchema,
  EvidenceSubmittedRealtimeSchema,
  EvidenceApprovedRealtimeSchema,
  EvidenceRejectedRealtimeSchema,
  PromotionInitiatedRealtimeSchema,
  PromotionDecidedRealtimeSchema,
  PromotionCompletedRealtimeSchema,
  RecalcPendingRealtimeSchema,
  RecalcCompletedRealtimeSchema,
  RecalcFailedRealtimeSchema,
  ConfigChangedRealtimeSchema,
  PromotionModeChangedRealtimeSchema,
]);

export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
export type RealtimeEventType = RealtimeEvent['eventType'];

export const REALTIME_EVENT_TYPES = [
  'snapshot.updated',
  'evidence.submitted',
  'evidence.approved',
  'evidence.rejected',
  'promotion.initiated',
  'promotion.decided',
  'promotion.completed',
  'recalc.pending',
  'recalc.completed',
  'recalc.failed',
  'config.changed',
  'organization.promotion_mode.changed',
] as const satisfies readonly RealtimeEventType[];

export function safeParseRealtimeEvent(raw: unknown):
  | { ok: true; event: RealtimeEvent }
  | { ok: false; error: z.ZodError } {
  const r = RealtimeEventSchema.safeParse(raw);
  if (r.success) return { ok: true, event: r.data };
  return { ok: false, error: r.error };
}
