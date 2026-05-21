// Scaffold guardrail: verifies the health-probe + worker-heartbeat surface for Story 1-8.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const apiSrc = resolve(root, 'apps/api/src');
const k8s = resolve(root, 'infra/k8s');

// ---------- /healthz (AC1 — already from story 1-2, re-asserted here) ----------

test('GET /healthz returns the {status:"ok"} literal (re-affirms AC1)', () => {
  const ctrl = readFileSync(resolve(apiSrc, 'health/health.controller.ts'), 'utf8');
  assert.match(ctrl, /@Controller\(\s*['"]?healthz['"]?\s*\)/, 'HealthController must be mounted at /healthz (AC1)');
  assert.match(ctrl, /status['"]?\s*:\s*['"]ok['"]/, 'HealthController must return {status:"ok"} (AC1)');
});

// ---------- /readyz (AC2) ----------

test('ReadinessController exists at /readyz and depends on a HealthService', () => {
  const ctrlFile = resolve(apiSrc, 'health/readiness.controller.ts');
  assert.ok(existsSync(ctrlFile), 'apps/api/src/health/readiness.controller.ts must exist (AC2)');
  const ctrl = readFileSync(ctrlFile, 'utf8');
  assert.match(ctrl, /@Controller\(\s*['"]?readyz['"]?\s*\)/, 'ReadinessController must be mounted at /readyz (AC2)');
  assert.match(ctrl, /HealthService/, 'ReadinessController must depend on HealthService (AC2)');
});

test('HealthService checks postgres, redis, and oidc reachability', () => {
  const svcFile = resolve(apiSrc, 'health/health.service.ts');
  assert.ok(existsSync(svcFile), 'apps/api/src/health/health.service.ts must exist (AC2)');
  const svc = readFileSync(svcFile, 'utf8');
  // Each dependency must be a named, individually-reportable check so the 503
  // response body can identify which one failed.
  assert.match(svc, /postgres/i, 'HealthService must include a postgres check (AC2)');
  assert.match(svc, /redis/i, 'HealthService must include a redis check (AC2)');
  assert.match(svc, /oidc/i, 'HealthService must include an oidc check (AC2)');
});

test('/readyz returns 503 with structured body listing failing deps', () => {
  const ctrl = readFileSync(resolve(apiSrc, 'health/readiness.controller.ts'), 'utf8');
  assert.match(
    ctrl,
    /HttpException|HttpStatus\.SERVICE_UNAVAILABLE|503|res\.status\(503\)/,
    '/readyz must respond with 503 when a dependency is down (AC2)',
  );
});

// ---------- Worker heartbeat (AC3) ----------

test('Worker heartbeat module exists and emits a Prometheus gauge', () => {
  const f = resolve(apiSrc, 'observability/worker-heartbeat.ts');
  assert.ok(existsSync(f), 'apps/api/src/observability/worker-heartbeat.ts must exist (AC3)');
  const src = readFileSync(f, 'utf8');
  assert.match(src, /Gauge/, 'worker-heartbeat must declare a prom-client Gauge (AC3)');
  assert.match(src, /30_?000|30\s*\*\s*1000/, 'worker-heartbeat must beat every 30 seconds (AC3)');
  assert.match(src, /fcm_worker_heartbeat/, 'metric name must start with fcm_worker_heartbeat for the Prometheus alert (AC3)');
  assert.match(src, /writeFile|writeFileSync/, 'worker-heartbeat must write a heartbeat file for the K8s exec probe (AC3, AC4)');
});

test('Worker heartbeat is wired into main.ts under API_MODE=worker', () => {
  const main = readFileSync(resolve(apiSrc, 'main.ts'), 'utf8');
  assert.match(main, /worker-heartbeat|startWorkerHeartbeat/, 'main.ts must start the worker heartbeat in worker mode (AC3)');
});

// ---------- K8s probe wiring (AC4) ----------

test('API deployment already targets /healthz (AC1 / AC4 — from Story 1-6)', () => {
  const dep = readFileSync(resolve(k8s, 'api/deployment.yaml'), 'utf8');
  assert.match(dep, /livenessProbe[\s\S]*?\/healthz/, 'API liveness must target /healthz (AC4)');
  assert.match(dep, /readinessProbe[\s\S]*?\/healthz/, 'API readiness must target /healthz (still — /readyz is server-side dependency check; K8s readinessProbe is process-up)');
});

test('Worker deployment uses heartbeat-file exec probe (replaces the interim pgrep)', () => {
  const dep = readFileSync(resolve(k8s, 'worker/deployment.yaml'), 'utf8');
  assert.match(
    dep,
    /heartbeat|HEARTBEAT_FILE/,
    'worker deployment livenessProbe must reference the heartbeat file (AC4 — replaces the interim pgrep probe from Story 1-6)',
  );
});
