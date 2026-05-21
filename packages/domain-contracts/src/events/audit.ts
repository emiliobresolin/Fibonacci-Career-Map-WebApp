import { z } from 'zod';

/**
 * Audit event taxonomy (PRD §10.1, Arch §6.4 + §9.3).
 *
 * Every state-mutating domain operation eventually lands in `audit_events`
 * via the outbox-relay worker (Story 3-3). This module is the single source
 * of truth for the SHAPE of those payloads — both at write time (the relay
 * validates before persisting) and at read time (the audit-read API in
 * Story 3-5 narrows on `eventType`).
 *
 * Discriminated union keyed on `eventType`. Each variant carries:
 *   • `eventId` — uuid; matches outbox_events.event_id AND audit_events.id.
 *   • `occurredAt` — ISO timestamp of the business event (NOT the relay time).
 *   • `actorId` — uuid of the user that initiated the mutation, or null for
 *     system events (cron, outbox relay, GC sweeps).
 *   • `organizationId` — uuid; tenant scope for every row.
 *   • `entityType` — short string naming the aggregate ('evidence',
 *     'score_snapshot', 'configuration', 'promotion', 'role_assignment',
 *     'visibility_rule', 'approval_workflow'). Audit reads filter on this.
 *   • `entityId` — uuid of the affected row, or null for org-scope events.
 *   • `reason` — free-text justification when applicable; required for
 *     approval/rejection events, optional elsewhere.
 *   • event-specific `before` / `after` fields, type-narrowed by `eventType`.
 *
 * Naming convention: `<entity>.<verb-past-tense>` — readable in logs and
 * matches the convention domain code already uses for outbox `event_type`.
 */

// ─── Shared base ────────────────────────────────────────────────────────────

const UuidSchema = z.string().uuid();
const IsoDateSchema = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO-8601 timestamp');

const AuditBaseSchema = z.object({
  eventId: UuidSchema,
  occurredAt: IsoDateSchema,
  /** Nullable for system-actor events. */
  actorId: UuidSchema.nullable(),
  organizationId: UuidSchema,
  /** Nullable for org-scope events that don't target a single row. */
  entityId: UuidSchema.nullable(),
});

// PRD §4.2 role enum; mirrors prisma Role.
const RoleSchema = z.enum(['EMPLOYEE', 'MANAGER', 'ADMIN']);

const VisibilitySettingSchema = z.enum(['OWN_ONLY', 'TEAM', 'ORG_SUMMARY', 'ORG_FULL']);

const ApprovalWorkflowKindSchema = z.enum(['SINGLE', 'DUAL_MANAGER', 'HR_GATE']);

const PromotionDecisionSchema = z.enum(['APPROVED', 'REJECTED']);

// ─── Per-event variants ─────────────────────────────────────────────────────

export const EvidenceSubmittedSchema = AuditBaseSchema.extend({
  eventType: z.literal('evidence.submitted'),
  entityType: z.literal('evidence'),
  reason: z.string().nullable(),
  before: z.null(),
  after: z.object({
    evidenceId: UuidSchema,
    requirementId: UuidSchema,
    employeeId: UuidSchema,
  }),
});

export const EvidenceApprovedSchema = AuditBaseSchema.extend({
  eventType: z.literal('evidence.approved'),
  entityType: z.literal('evidence'),
  // PRD §10.1: approval REQUIRES a reason.
  reason: z.string().min(1),
  before: z.object({
    evidenceId: UuidSchema,
    employeeId: UuidSchema,
    beforeScore: z.number(),
  }),
  after: z.object({
    afterScore: z.number(),
  }),
});

export const EvidenceRejectedSchema = AuditBaseSchema.extend({
  eventType: z.literal('evidence.rejected'),
  entityType: z.literal('evidence'),
  // PRD §10.1: rejection REQUIRES a reason.
  reason: z.string().min(1),
  before: z.null(),
  after: z.object({
    evidenceId: UuidSchema,
    employeeId: UuidSchema,
  }),
});

export const ScoreRecalculatedSchema = AuditBaseSchema.extend({
  eventType: z.literal('score.recalculated'),
  entityType: z.literal('score_snapshot'),
  reason: z.string().nullable(),
  before: z.object({
    employeeId: UuidSchema,
    triggeringEventId: UuidSchema,
    beforeSnapshotId: UuidSchema.nullable(),
  }),
  after: z.object({
    afterSnapshotId: UuidSchema,
  }),
});

export const ConfigurationChangedSchema = AuditBaseSchema.extend({
  eventType: z.literal('configuration.changed'),
  entityType: z.literal('configuration'),
  reason: z.string().nullable(),
  before: z.object({
    configEntityType: z.string().min(1),
    configEntityId: UuidSchema,
    field: z.string().min(1),
    beforeValue: z.unknown(),
  }),
  after: z.object({
    afterValue: z.unknown(),
  }),
});

export const PromotionInitiatedSchema = AuditBaseSchema.extend({
  eventType: z.literal('promotion.initiated'),
  entityType: z.literal('promotion'),
  reason: z.string().nullable(),
  before: z.null(),
  after: z.object({
    employeeId: UuidSchema,
    fromLevelId: UuidSchema,
    toLevelId: UuidSchema,
  }),
});

export const PromotionDecidedSchema = AuditBaseSchema.extend({
  eventType: z.literal('promotion.decided'),
  entityType: z.literal('promotion'),
  // PRD §10.1: approve/reject REQUIRES a reason.
  reason: z.string().min(1),
  before: z.object({
    employeeId: UuidSchema,
  }),
  after: z.object({
    decision: PromotionDecisionSchema,
  }),
});

export const PromotionCompletedSchema = AuditBaseSchema.extend({
  eventType: z.literal('promotion.completed'),
  entityType: z.literal('promotion'),
  reason: z.string().nullable(),
  before: z.object({
    employeeId: UuidSchema,
    fromLevelId: UuidSchema,
  }),
  after: z.object({
    toLevelId: UuidSchema,
    finalScore: z.number(),
    finalEvidenceIds: z.array(UuidSchema),
  }),
});

export const RoleAssignmentChangedSchema = AuditBaseSchema.extend({
  eventType: z.literal('role_assignment.changed'),
  entityType: z.literal('role_assignment'),
  reason: z.string().nullable(),
  before: z.object({
    targetUserId: UuidSchema,
    fromRole: RoleSchema.nullable(),
  }),
  after: z.object({
    toRole: RoleSchema.nullable(),
  }),
});

export const VisibilityRuleChangedSchema = AuditBaseSchema.extend({
  eventType: z.literal('visibility_rule.changed'),
  entityType: z.literal('visibility_rule'),
  reason: z.string().nullable(),
  before: z.object({
    fromSetting: VisibilitySettingSchema,
  }),
  after: z.object({
    toSetting: VisibilitySettingSchema,
  }),
});

export const ApprovalWorkflowChangedSchema = AuditBaseSchema.extend({
  eventType: z.literal('approval_workflow.changed'),
  entityType: z.literal('approval_workflow'),
  reason: z.string().nullable(),
  before: z.object({
    fromKind: ApprovalWorkflowKindSchema,
  }),
  after: z.object({
    toKind: ApprovalWorkflowKindSchema,
  }),
});

// session.revoked — Story 2-3. Surfaced in the taxonomy because the
// outbox relay (Story 3-3) validates every persisted event against this
// schema, and revocation must be auditable per PRD §10.2 ("every
// data-mutating event writes at least one audit record"). The PRD's
// §10.1 table didn't enumerate this case but the §9 RBAC narrative
// implies it; the variant fills the gap.
export const SessionRevokedSchema = AuditBaseSchema.extend({
  eventType: z.literal('session.revoked'),
  entityType: z.literal('session'),
  reason: z.string().nullable(),
  before: z.object({
    targetUserId: UuidSchema,
    /** Count of sessions that were active for this user at revoke time. */
    revokedSessionCount: z.number().int().nonnegative(),
  }),
  after: z.null(),
});

// ─── Discriminated union ────────────────────────────────────────────────────

export const AuditEventSchema = z.discriminatedUnion('eventType', [
  EvidenceSubmittedSchema,
  EvidenceApprovedSchema,
  EvidenceRejectedSchema,
  ScoreRecalculatedSchema,
  ConfigurationChangedSchema,
  PromotionInitiatedSchema,
  PromotionDecidedSchema,
  PromotionCompletedSchema,
  RoleAssignmentChangedSchema,
  VisibilityRuleChangedSchema,
  ApprovalWorkflowChangedSchema,
  SessionRevokedSchema,
]);

export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditEventType = AuditEvent['eventType'];

export type EvidenceSubmitted = z.infer<typeof EvidenceSubmittedSchema>;
export type EvidenceApproved = z.infer<typeof EvidenceApprovedSchema>;
export type EvidenceRejected = z.infer<typeof EvidenceRejectedSchema>;
export type ScoreRecalculated = z.infer<typeof ScoreRecalculatedSchema>;
export type ConfigurationChanged = z.infer<typeof ConfigurationChangedSchema>;
export type PromotionInitiated = z.infer<typeof PromotionInitiatedSchema>;
export type PromotionDecided = z.infer<typeof PromotionDecidedSchema>;
export type PromotionCompleted = z.infer<typeof PromotionCompletedSchema>;
export type RoleAssignmentChanged = z.infer<typeof RoleAssignmentChangedSchema>;
export type VisibilityRuleChanged = z.infer<typeof VisibilityRuleChangedSchema>;
export type ApprovalWorkflowChanged = z.infer<typeof ApprovalWorkflowChangedSchema>;
export type SessionRevoked = z.infer<typeof SessionRevokedSchema>;

/** All declared event types — kept in sync with the discriminator union. */
export const AUDIT_EVENT_TYPES = [
  'evidence.submitted',
  'evidence.approved',
  'evidence.rejected',
  'score.recalculated',
  'configuration.changed',
  'promotion.initiated',
  'promotion.decided',
  'promotion.completed',
  'role_assignment.changed',
  'visibility_rule.changed',
  'approval_workflow.changed',
  'session.revoked',
] as const satisfies readonly AuditEventType[];

/**
 * Parse an audit event payload. Returns the typed event on success or
 * throws a `z.ZodError` on validation failure. The relay worker (Story 3-3)
 * calls this before persisting to `audit_events`; producers that emit
 * outbox rows are expected to pass through this schema first.
 */
export function parseAuditEvent(raw: unknown): AuditEvent {
  return AuditEventSchema.parse(raw);
}

/**
 * Soft variant: returns a discriminated result instead of throwing. Use in
 * the relay worker so a malformed payload can be routed to DLQ with a
 * clear error message rather than crashing the consumer.
 */
export function safeParseAuditEvent(raw: unknown):
  | { ok: true; event: AuditEvent }
  | { ok: false; error: z.ZodError } {
  const result = AuditEventSchema.safeParse(raw);
  if (result.success) return { ok: true, event: result.data };
  return { ok: false, error: result.error };
}
