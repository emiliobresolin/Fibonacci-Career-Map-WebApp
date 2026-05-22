import type { Queue } from 'bullmq';

import type { ActorContext } from '../auth/actor-context.js';
import { withActor } from '../auth/actor-context.js';
import type {
  EvidenceExpiryScanPayload,
  NotificationDeliverPayload,
  ObservabilityClientMetricsPayload,
  ScoringRecalcEmployeePayload,
  ScoringRecalcOrgBulkPayload,
  SnapshotPartitionMaintenancePayload,
} from './job-payloads.js';

/**
 * Typed enqueue helpers per architecture-listed queue (Story 4-2 AC2).
 *
 * Each helper:
 *   • takes the concrete Queue instance (typically `@InjectQueue(...)`
 *     in the calling service),
 *   • takes the ActorContext (Story 2-5 invariant), wrapping the
 *     payload via `withActor` so the consumer can call
 *     `actorFromJobData(job.data)` and round-trip the actor,
 *   • assigns a deterministic `jobId` so retries / duplicate enqueues
 *     coalesce in BullMQ rather than producing duplicate work.
 *
 * The `cron`/system-fired helpers (partition-maintenance, expiry-scan)
 * still take an ActorContext — they pass a synthetic "system actor"
 * shape, which the cron scheduler service constructs once at boot.
 */

// Helpers that take an ActorContext (every queue except observability.client-metrics).
type ActorOf<T> = T extends { actor: infer A } ? A : never;
type WithoutActor<T> = Omit<T, 'actor'>;

export async function enqueueScoringRecalcEmployee(
  queue: Queue<ScoringRecalcEmployeePayload>,
  actor: ActorContext,
  data: WithoutActor<ScoringRecalcEmployeePayload>,
): Promise<void> {
  // Deterministic jobId per (employee, trigger). Two consecutive
  // approves on the same employee coalesce into one recalc — BullMQ's
  // `getJob(jobId)` returns the existing entry on duplicate `add`.
  const jobId = `recalc:${data.employeeId}:${data.trigger}`;
  await queue.add('recalc', withActor(actor, data) as ScoringRecalcEmployeePayload, { jobId });
}

export async function enqueueScoringRecalcOrgBulk(
  queue: Queue<ScoringRecalcOrgBulkPayload>,
  actor: ActorContext,
  data: WithoutActor<ScoringRecalcOrgBulkPayload>,
): Promise<void> {
  // One bulk recalc per (org, trigger) at a time — coalesces fan-out
  // from rapid configuration edits.
  const jobId = `recalc-bulk:${actor.organization_id}:${data.trigger}`;
  await queue.add('recalc-bulk', withActor(actor, data) as ScoringRecalcOrgBulkPayload, { jobId });
}

export async function enqueueEvidenceExpiryScan(
  queue: Queue<EvidenceExpiryScanPayload>,
  actor: ActorContext,
  data: WithoutActor<EvidenceExpiryScanPayload>,
): Promise<void> {
  // The scan is org-scoped via the actor. One scan per org per day.
  const day = new Date().toISOString().slice(0, 10);
  const jobId = `scan:${actor.organization_id}:${day}`;
  await queue.add('scan', withActor(actor, data) as EvidenceExpiryScanPayload, { jobId });
}

export async function enqueueSnapshotPartitionMaintenance(
  queue: Queue<SnapshotPartitionMaintenancePayload>,
  actor: ActorContext,
  data: WithoutActor<SnapshotPartitionMaintenancePayload>,
): Promise<void> {
  // One maintenance run per anchor-day. The scheduler service fires
  // this daily.
  const day = data.anchor.slice(0, 10);
  const jobId = `maintain:${day}`;
  await queue.add('maintain', withActor(actor, data) as SnapshotPartitionMaintenancePayload, { jobId });
}

export async function enqueueNotificationDeliver(
  queue: Queue<NotificationDeliverPayload>,
  actor: ActorContext,
  data: WithoutActor<NotificationDeliverPayload>,
): Promise<void> {
  // One delivery attempt per (notificationId, recipient). Channel-
  // level retries are inside the consumer, not at the queue level.
  const jobId = `deliver:${data.notificationId}:${data.recipientUserId}`;
  await queue.add('deliver', withActor(actor, data) as NotificationDeliverPayload, { jobId });
}

// observability.client-metrics has no actor (telemetry, no user context
// required). Producers post directly without `withActor`.
export async function enqueueObservabilityClientMetrics(
  queue: Queue<ObservabilityClientMetricsPayload>,
  data: ObservabilityClientMetricsPayload,
): Promise<void> {
  // sessionId is unique per browser session so duplicates within a
  // 24h removeOnComplete window coalesce naturally.
  const jobId = `record:${data.sessionId}`;
  await queue.add('record', data, { jobId });
}

// Type-only re-exports so callers can `import { ScoringRecalcEmployeePayload }
// from '@/jobs/enqueue.js'` for the public job-payload surface.
export type {
  ScoringRecalcEmployeePayload,
  ScoringRecalcOrgBulkPayload,
  EvidenceExpiryScanPayload,
  SnapshotPartitionMaintenancePayload,
  NotificationDeliverPayload,
  ObservabilityClientMetricsPayload,
  ActorOf,
};
