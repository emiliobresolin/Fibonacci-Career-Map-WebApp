# Alert: DLQ depth > 0 for 5 minutes

**Severity:** page (operator action required)
**Story:** 4-5 (FCM Async-Jobs Domain)
**Owner:** platform on-call

## Detection

A BullMQ DLQ queue (`<queue>.dlq`) with at least one job sitting in `waiting` or `active` state for more than 5 minutes indicates that one or more domain-job failures have exceeded their retry budget and are awaiting operator triage.

## PromQL

```promql
fcm_queue_dlq_depth > 0
```

## Alerting rule (target file: Story 16-2 deliverable)

```yaml
- alert: FcmDlqDepthHigh
  expr: fcm_queue_dlq_depth > 0
  for: 5m
  labels:
    severity: page
    component: jobs
  annotations:
    summary: "Dead-letter queue {{ $labels.queue }} has unprocessed failures."
    description: |
      The DLQ for queue `{{ $labels.queue }}` has been non-empty for 5+ minutes.
      Inspect the failed jobs via the admin UI at /settings/ops/dlq
      (admin role required) and either re-enqueue them after fixing
      the root cause or document why the failures are expected.
    runbook_url: "https://<docs-host>/ops/alerts/dlq-depth"
```

## Triage procedure

1. **Open the DLQ admin UI** at `https://<host>/settings/ops/dlq`. The page lists every DLQ with its depth and the most recent failure reasons.

2. **Identify the failure pattern.** Look at the `failureReason` for the most recent N jobs. Patterns:
   - Same error across all jobs → systemic bug; do NOT re-enqueue, escalate to engineering.
   - One-off error (Redis blip, transient DB error) → re-enqueue with the one-click button.
   - Stub-consumer errors (`consumer for queue 'X' is not implemented yet — ships with Story Y`) → producer wired ahead of consumer; pause the producer until the consumer story ships.

3. **Re-enqueue** via the UI (`POST /v1/dlq/<queue>/<jobId>/replay`). Each replay is logged with `op: 'dlq_replay_request'` + actor user-id; cross-reference these in the audit pipeline.

4. **Confirm drainage** — within 5 minutes, `fcm_queue_dlq_depth` should return to 0 and `fcm_queue_processing_duration_seconds{queue,outcome="success"}` should observe the replayed jobs.

5. **Escalate** if the same job re-fails after replay — that indicates the failure is not transient.

## What this alert does NOT cover

- `observability.client-metrics` has `dlq: null` (best-effort telemetry); failures there are dropped silently. Use `fcm_queue_depth{queue="observability.client-metrics"}` for that queue's health.
- Job-success rate (low success may indicate problems before they reach the DLQ). Track via `rate(fcm_queue_processing_duration_seconds_count{outcome="success"}[5m])`.
- Backlog depth on the main queue (separate alert — `fcm_queue_depth > N` thresholds vary per queue).
