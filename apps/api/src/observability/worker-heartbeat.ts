import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Gauge, register } from 'prom-client';

// Worker heartbeat (Story 1-8 AC3). Two outputs:
//
//   1. Prometheus gauge `fcm_worker_heartbeat_timestamp_seconds` updated every
//      30s. EPIC-16 ships the alert: `time() - fcm_worker_heartbeat_timestamp_seconds > 120`
//      pages on-call when a worker stops beating for 2 minutes.
//
//   2. A heartbeat file at HEARTBEAT_FILE (default /app/.cache/heartbeat) whose
//      mtime is checked by Kubernetes' livenessProbe — workers have no HTTP
//      surface so exec probes against the filesystem are the canonical pattern.
//
// When BullMQ lands in EPIC-4, the heartbeat is co-located with the BullMQ
// worker loop so the metric reflects active job processing, not just process
// existence. Until then, the setInterval here proves the process is alive and
// the event loop responsive.

const HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_HEARTBEAT_PATH = '/app/.cache/heartbeat';

const heartbeatGauge = new Gauge({
  name: 'fcm_worker_heartbeat_timestamp_seconds',
  help: 'Unix timestamp (seconds) of the last successful worker heartbeat. Alert when (time() - this) > 120.',
  labelNames: ['mode'] as const,
  registers: [register],
});

let timer: NodeJS.Timeout | undefined;

export type HeartbeatHandle = {
  stop(): void;
};

export function startWorkerHeartbeat(opts?: { intervalMs?: number; filePath?: string }): HeartbeatHandle {
  const intervalMs = opts?.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const filePath = resolve(opts?.filePath ?? process.env['HEARTBEAT_FILE'] ?? DEFAULT_HEARTBEAT_PATH);

  const beat = async (): Promise<void> => {
    const now = Date.now();
    heartbeatGauge.set({ mode: process.env['API_MODE'] ?? 'worker' }, now / 1000);
    try {
      await writeFile(filePath, `${now}\n`, { encoding: 'utf8' });
    } catch (err) {
      // A failed file write is surfaced via the missing-update on the gauge
      // and the K8s probe will eventually fail. Logging here avoids silent loss.
      process.stderr.write(`heartbeat write failed (${filePath}): ${String(err)}\n`);
    }
  };

  // Beat once immediately so the first probe interval succeeds; then on schedule.
  void beat();
  timer = setInterval(() => void beat(), intervalMs);
  timer.unref();

  return {
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}
