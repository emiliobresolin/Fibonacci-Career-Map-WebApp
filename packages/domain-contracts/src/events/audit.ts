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
    // Story 8-5 AC2: the actor's role is captured so HR investigations
    // can distinguish MANAGER decisions from ADMIN-override decisions.
    // MUST live INSIDE `after` (not at the top level) because the
    // outbox-relay only persists the structural columns + `before` /
    // `after` JSONB into audit_events — a top-level field would be
    // validated but dropped before reaching the persisted row.
    // Optional for backward compat with pre-8-5 emit shapes.
    actorRole: RoleSchema.optional(),
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
    // Story 8-5 AC2: same actorRole capture as evidence.approved,
    // inside `after` so the relay actually persists it.
    actorRole: RoleSchema.optional(),
    // Story 8-6 AC3: when an APPROVED row is retroactively rejected
    // (FR-4.7), `retroactive` is true and `approvedAt` / `rejectedAt`
    // carry the date pair for date-discrepancy investigation.
    //
    // CONSUMER CONTRACT: audit-readers MUST treat field ABSENCE as
    // "first-pass rejection" (PENDING_APPROVAL → REJECTED). The
    // emit-side (apps/api/src/evidence/audit.ts) only sets these
    // three fields when the source state was APPROVED, so a
    // first-pass payload has none of them; relying on
    // `payload.after.retroactive === true` is the canonical check.
    retroactive: z.boolean().optional(),
    approvedAt: IsoDateSchema.optional(),
    rejectedAt: IsoDateSchema.optional(),
  }),
});

/** Story 8-7 — the daily expiry-scan cron flipping APPROVED →
 *  EXPIRED. One audit row per evidence item that transitions. The
 *  payload carries the original `approvedAt` + the trigger `expiredAt`
 *  + the `requirementId` so audit readers can render "expired N
 *  months after approval" for the affected employee timeline.
 *  `actorId` is null because the transition is system-initiated
 *  (cron, not a human actor). */
export const EvidenceExpiredSchema = AuditBaseSchema.extend({
  eventType: z.literal('evidence.expired'),
  entityType: z.literal('evidence'),
  reason: z.string().nullable(),
  before: z.object({
    evidenceId: UuidSchema,
    employeeId: UuidSchema,
    requirementId: UuidSchema,
    approvedAt: IsoDateSchema,
  }),
  after: z.object({
    expiredAt: IsoDateSchema,
  }),
});

/** Story 8-3 — every successful presigned-GET issuance lands one
 *  `evidence.retrieved` row. Carries the actor (who got the URL) +
 *  the subject (whose evidence) + the requirement. Useful for the
 *  audit-read API to answer "who has seen this evidence?". This is a
 *  read-side event so `after: null` mirrors the session.revoked
 *  shape; the audit-row context lives in `before`. */
export const EvidenceRetrievedSchema = AuditBaseSchema.extend({
  eventType: z.literal('evidence.retrieved'),
  entityType: z.literal('evidence'),
  reason: z.string().nullable(),
  before: z.object({
    evidenceId: UuidSchema,
    employeeId: UuidSchema,
    requirementId: UuidSchema,
  }),
  after: z.null(),
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

/** `change_type` carried in the `configuration.changed` payload
 *  (Story 7-9). Drives the Epic-9 bulk-recalc consumer's strategy:
 *  CREATE has no employees yet; UPDATE / DEACTIVATE / DELETE each
 *  trigger different cache/snapshot rebuild policies. */
export const ConfigChangeTypeSchema = z.enum(['CREATE', 'UPDATE', 'DEACTIVATE', 'DELETE']);

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
  // Story 7-9: optional bulk-recalc payload. Zod's default strip mode
  // silently drops unknown keys, which would silently lose these on
  // the relay's parse → audit_events insert path. Declared as optional
  // so pre-7-9 callers (none today, but defense-in-depth) still
  // validate.
  changeType: ConfigChangeTypeSchema.optional(),
  affectedEmployeeIds: z.array(UuidSchema).optional(),
  chunkIndex: z.number().int().nonnegative().optional(),
  chunkTotal: z.number().int().positive().optional(),
});

/** Story 7-10 — org-level rollout mode (CALIBRATION ↔ ACTIVE). */
export const PromotionModeSchema = z.enum(['CALIBRATION', 'ACTIVE']);

export const OrganizationPromotionModeChangedSchema = AuditBaseSchema.extend({
  eventType: z.literal('organization.promotion_mode.changed'),
  entityType: z.literal('organization'),
  // CALIBRATION → ACTIVE requires rationale ≥ 100 chars (per Arch §6.2);
  // the schema accepts the nullable form so ACTIVE → CALIBRATION can
  // omit it, but the service enforces the 100-char floor on the forward
  // transition before this event is constructed.
  reason: z.string().nullable(),
  before: z.object({
    fromMode: PromotionModeSchema,
  }),
  after: z.object({
    toMode: PromotionModeSchema,
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

// blocker.opened / blocker.resolved — Story 6-2b. State changes on
// employee_blockers are audited per PRD §8.5 ("every state change
// writes an audit event"). `kind` is the canonical BlockerKind enum
// mirrored as a string literal here; `entityType: 'employee_blocker'`
// matches the outbox row's aggregate_type.
const BlockerKindSchema = z.enum(['PIP', 'PERFORMANCE_CONCERN', 'HR_HOLD', 'OTHER']);

export const BlockerOpenedSchema = AuditBaseSchema.extend({
  eventType: z.literal('blocker.opened'),
  entityType: z.literal('employee_blocker'),
  // Reason carries the same ≥20-char minimum the DB enforces.
  reason: z.string().min(20),
  before: z.null(),
  after: z.object({
    employeeId: UuidSchema,
    kind: BlockerKindSchema,
  }),
});

export const BlockerResolvedSchema = AuditBaseSchema.extend({
  eventType: z.literal('blocker.resolved'),
  entityType: z.literal('employee_blocker'),
  // Optional resolution note recorded at resolve time. Stored
  // verbatim in audit_events.reason for traceability.
  reason: z.string().nullable(),
  before: z.object({
    employeeId: UuidSchema,
    kind: BlockerKindSchema,
  }),
  after: z.null(),
});

// configuration.seeded — Story 6-3. Each seeded configuration row
// (track / level / layer / requirement / promotion_rule) lands one
// audit event so operators can trace the exact rows the CDF seed
// produced for a given org. `kind` discriminates which configuration
// surface the row belongs to; `name` is a human-readable label for
// audit-read UI rendering. The outbox row's aggregate_id is the
// seeded row's UUID, so audit_events.entity_id pinpoints the row.
const SeededConfigKindSchema = z.enum([
  'career_track',
  'level',
  'layer',
  'requirement',
  'promotion_rule',
]);

export const ConfigurationSeededSchema = AuditBaseSchema.extend({
  eventType: z.literal('configuration.seeded'),
  entityType: z.literal('configuration'),
  reason: z.string().nullable(),
  before: z.null(),
  after: z.object({
    kind: SeededConfigKindSchema,
    name: z.string().min(1),
  }),
});

// employee.imported — Story 6-5. Emitted once per row produced by the
// bulk CSV import. Captures the user/employee row created (the
// audit row's entity_id is the new employee.id) and the optional
// track / level / manager assignment so an audit reader can recreate
// the imported employee's initial state without re-reading the rows.
// `actorId` is the importing ADMIN (audit attribution comes from the
// @ActorContext decorator on the controller).
export const EmployeeImportedSchema = AuditBaseSchema.extend({
  eventType: z.literal('employee.imported'),
  entityType: z.literal('employee'),
  reason: z.string().nullable(),
  before: z.null(),
  after: z.object({
    userId: UuidSchema,
    email: z.string().min(1),
    displayName: z.string().min(1),
    careerTrackId: UuidSchema.nullable(),
    levelId: UuidSchema.nullable(),
    managerEmployeeId: UuidSchema.nullable(),
  }),
});

// bootstrap_admin.provisioned — Story 6-4. The org-bootstrap flow creates
// the very first ADMIN user (user row + role_assignment + bootstrap_credential
// row) in one atomic transaction. The single audit event captures all three
// because they're inseparable: a credential without its admin user is
// nonsense, and a role_assignment without the user is nonsense. `actorId` is
// null — bootstrap runs as internal provisioning tooling, not as a tenant
// user. `userId` in the payload is the new admin's user_id so audit readers
// can pivot from the bootstrap event to the user lifecycle.
export const BootstrapAdminProvisionedSchema = AuditBaseSchema.extend({
  eventType: z.literal('bootstrap_admin.provisioned'),
  entityType: z.literal('bootstrap_credential'),
  reason: z.string().nullable(),
  before: z.null(),
  after: z.object({
    userId: UuidSchema,
    username: z.string().min(1),
  }),
});

// bootstrap_admin.disabled — Story 6-4 AC2. Emitted when the bootstrap
// credential is auto-retired after the first OIDC-linked ADMIN sign-in
// (Story 2-7 AC2, wired in auth.controller.ts). `actorId` is the OIDC
// admin who triggered the retirement; the event proves WHO caused the
// fallback to lock.
export const BootstrapAdminDisabledSchema = AuditBaseSchema.extend({
  eventType: z.literal('bootstrap_admin.disabled'),
  entityType: z.literal('bootstrap_credential'),
  reason: z.string().nullable(),
  before: z.object({
    username: z.string().min(1),
  }),
  after: z.null(),
});

// recovery_codes.provisioned — Story 6-4. The bootstrap flow issues a
// batch of 10 single-use OIDC-outage recovery codes. The event is
// org-scope (no single row id) — the batch is the unit, not an
// individual code. `entityId` is null because the batch isn't a row;
// `count` in the payload records the batch size for audit clarity.
export const RecoveryCodesProvisionedSchema = AuditBaseSchema.extend({
  eventType: z.literal('recovery_codes.provisioned'),
  entityType: z.literal('recovery_code'),
  reason: z.string().nullable(),
  before: z.null(),
  after: z.object({
    count: z.number().int().positive(),
  }),
});

// organization.created — Story 6-1. Bootstrap-tooling provisioning emits
// this event when a new org row lands. `actorId` is null (system event —
// the org has no users yet when this fires), and the variant carries the
// AC1-mandated default fields so an audit reader can verify them at the
// moment of provisioning without re-reading the row.
export const OrganizationCreatedSchema = AuditBaseSchema.extend({
  eventType: z.literal('organization.created'),
  entityType: z.literal('organization'),
  reason: z.string().nullable(),
  before: z.null(),
  after: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    visibilityDefault: VisibilitySettingSchema,
    approvalWorkflowDefault: ApprovalWorkflowKindSchema,
    promotionMode: z.enum(['CALIBRATION', 'ACTIVE']),
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
  EvidenceRetrievedSchema,
  EvidenceExpiredSchema,
  ScoreRecalculatedSchema,
  ConfigurationChangedSchema,
  PromotionInitiatedSchema,
  PromotionDecidedSchema,
  PromotionCompletedSchema,
  RoleAssignmentChangedSchema,
  VisibilityRuleChangedSchema,
  ApprovalWorkflowChangedSchema,
  OrganizationPromotionModeChangedSchema,
  SessionRevokedSchema,
  OrganizationCreatedSchema,
  BlockerOpenedSchema,
  BlockerResolvedSchema,
  ConfigurationSeededSchema,
  BootstrapAdminProvisionedSchema,
  BootstrapAdminDisabledSchema,
  RecoveryCodesProvisionedSchema,
  EmployeeImportedSchema,
]);

export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditEventType = AuditEvent['eventType'];

export type EvidenceSubmitted = z.infer<typeof EvidenceSubmittedSchema>;
export type EvidenceApproved = z.infer<typeof EvidenceApprovedSchema>;
export type EvidenceRejected = z.infer<typeof EvidenceRejectedSchema>;
export type EvidenceRetrieved = z.infer<typeof EvidenceRetrievedSchema>;
export type EvidenceExpired = z.infer<typeof EvidenceExpiredSchema>;
export type ScoreRecalculated = z.infer<typeof ScoreRecalculatedSchema>;
export type ConfigurationChanged = z.infer<typeof ConfigurationChangedSchema>;
export type PromotionInitiated = z.infer<typeof PromotionInitiatedSchema>;
export type PromotionDecided = z.infer<typeof PromotionDecidedSchema>;
export type PromotionCompleted = z.infer<typeof PromotionCompletedSchema>;
export type RoleAssignmentChanged = z.infer<typeof RoleAssignmentChangedSchema>;
export type VisibilityRuleChanged = z.infer<typeof VisibilityRuleChangedSchema>;
export type ApprovalWorkflowChanged = z.infer<typeof ApprovalWorkflowChangedSchema>;
export type OrganizationPromotionModeChanged = z.infer<typeof OrganizationPromotionModeChangedSchema>;
export type SessionRevoked = z.infer<typeof SessionRevokedSchema>;
export type OrganizationCreated = z.infer<typeof OrganizationCreatedSchema>;
export type BlockerOpened = z.infer<typeof BlockerOpenedSchema>;
export type BlockerResolved = z.infer<typeof BlockerResolvedSchema>;
export type ConfigurationSeeded = z.infer<typeof ConfigurationSeededSchema>;
export type BootstrapAdminProvisioned = z.infer<typeof BootstrapAdminProvisionedSchema>;
export type BootstrapAdminDisabled = z.infer<typeof BootstrapAdminDisabledSchema>;
export type RecoveryCodesProvisioned = z.infer<typeof RecoveryCodesProvisionedSchema>;
export type EmployeeImported = z.infer<typeof EmployeeImportedSchema>;

/** All declared event types — kept in sync with the discriminator union. */
export const AUDIT_EVENT_TYPES = [
  'evidence.submitted',
  'evidence.approved',
  'evidence.rejected',
  'evidence.retrieved',
  'evidence.expired',
  'score.recalculated',
  'configuration.changed',
  'promotion.initiated',
  'promotion.decided',
  'promotion.completed',
  'role_assignment.changed',
  'visibility_rule.changed',
  'approval_workflow.changed',
  'organization.promotion_mode.changed',
  'session.revoked',
  'organization.created',
  'blocker.opened',
  'blocker.resolved',
  'configuration.seeded',
  'bootstrap_admin.provisioned',
  'bootstrap_admin.disabled',
  'recovery_codes.provisioned',
  'employee.imported',
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
