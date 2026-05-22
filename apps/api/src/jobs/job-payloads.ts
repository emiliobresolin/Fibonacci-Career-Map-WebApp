import type { JobPayloadWithActor } from '../auth/actor-context.js';

/**
 * Typed job payload contracts for every architecture-listed queue
 * (Arch §7.2, Story 4-2 AC1). The shape is the SCAFFOLD contract: the
 * stub consumers in `apps/api/src/jobs/stub-consumers/` accept these
 * shapes and throw "not-implemented" until the owning story fills in
 * the real consumer.
 *
 * Every payload that originates from a user action carries an
 * `actor: ActorContext` (Story 2-5 propagation invariant). System-
 * originated jobs (cron-fired scans / maintenance) wrap their payload
 * in a system-actor shape — the stub consumers tolerate either form
 * via `actorFromJobData` validation.
 */

// ─── scoring.recalc-employee ────────────────────────────────────────
// One employee's score is recomputed. Triggered by evidence
// approve/reject, role change, or a manual admin recalc.
// Owning story: 9-5 (ScoringOrchestrator consumer).
export type ScoringRecalcEmployeeJobName = 'recalc';
export type ScoringRecalcEmployeePayload = JobPayloadWithActor<{
  employeeId: string;
  /** What triggered this recalc — useful for tracing the chain back
   *  to a specific business event. */
  trigger:
    | 'evidence.approved'
    | 'evidence.rejected'
    | 'role_assignment.changed'
    | 'configuration.changed'
    | 'manual';
  /** Outbox event_id that produced this recalc, if any. Lets the
   *  scoring service emit a downstream audit row that references
   *  the originating mutation. */
  originatingEventId?: string;
}>;

// ─── scoring.recalc-org-bulk ────────────────────────────────────────
// Every employee in an organization is recomputed. Triggered when
// configuration (track / level / requirement) changes. Rate-limited
// per queue to keep one tenant's storm from starving interactive
// recalcs (Arch §7.4). Owning story: 9-6.
export type ScoringRecalcOrgBulkJobName = 'recalc-bulk';
export type ScoringRecalcOrgBulkPayload = JobPayloadWithActor<{
  trigger: 'configuration.changed' | 'manual';
  /** Optional cursor to resume a paginated bulk recalc that was
   *  interrupted. The orchestrator decides the page size. */
  cursor?: string;
  originatingEventId?: string;
}>;

// ─── evidence.expiry-scan ───────────────────────────────────────────
// Cron-fired scan that surfaces evidence approaching its expiry date
// AND issues stale-evidence notifications. Owning story: 8-7.
export type EvidenceExpiryScanJobName = 'scan';
export type EvidenceExpiryScanPayload = JobPayloadWithActor<{
  /** Days-ahead window to scan. Default 30 in the cron config. */
  lookaheadDays: number;
}>;

// ─── snapshot.partition-maintenance ─────────────────────────────────
// Cron-fired creation of the next month's audit_events partition AND
// archival/cleanup of old outbox rows. Owning story: 3-6 (already
// shipped; this entry is for completeness of the queue catalog).
export type SnapshotPartitionMaintenanceJobName = 'maintain';
export type SnapshotPartitionMaintenancePayload = JobPayloadWithActor<{
  /** Anchor timestamp (ISO). The maintenance run creates the next
   *  3 monthly partitions from this anchor (Arch §6.4 / AR-8). */
  anchor: string;
}>;

// ─── notification.deliver ───────────────────────────────────────────
// Per-recipient notification dispatch (in-app + email when wired).
// Owning story: 14-1 (NotificationService).
export type NotificationDeliverJobName = 'deliver';
export type NotificationDeliverPayload = JobPayloadWithActor<{
  notificationId: string;
  recipientUserId: string;
  /** Which channels to attempt — at least one must be present. */
  channels: Array<'in_app' | 'email'>;
}>;

// ─── observability.client-metrics ───────────────────────────────────
// End-of-session beacon from the 3D map carrying FPS / memory / interaction
// counters. Owning story: 11-8. No actor required — telemetry is
// best-effort and the producer (browser) attaches a session-id only.
// The stub consumer treats payload as opaque until 11-8 lands.
export type ObservabilityClientMetricsJobName = 'record';
export type ObservabilityClientMetricsPayload = {
  sessionId: string;
  /** Free-form metric map. Validated against a richer schema in 11-8. */
  metrics: Record<string, number>;
};
