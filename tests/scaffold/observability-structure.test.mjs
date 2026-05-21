// Scaffold guardrail: verifies the observability baseline for Story 1-7.
// File-system + content assertions only; OTLP/Sentry/Prometheus delivery is
// verified end-to-end in actual deploys.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const api = resolve(root, 'apps/api');
const apiSrc = resolve(api, 'src');
const web = resolve(root, 'apps/web');

// ---------- API deps ----------

test('apps/api declares pino + prom-client + @opentelemetry + @sentry deps', () => {
  const pkg = JSON.parse(readFileSync(resolve(api, 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.ok(deps['nestjs-pino'], 'nestjs-pino must be installed (AC1)');
  assert.ok(deps['prom-client'], 'prom-client must be installed (AC2)');
  assert.ok(deps['@opentelemetry/sdk-node'], '@opentelemetry/sdk-node must be installed (AC3)');
  assert.ok(deps['@opentelemetry/exporter-trace-otlp-http'] || deps['@opentelemetry/exporter-trace-otlp-grpc'], 'an OTLP exporter must be installed (AC3)');
  assert.ok(deps['@opentelemetry/auto-instrumentations-node'] || deps['@opentelemetry/instrumentation-http'], 'OTel instrumentation must be installed (AC3)');
  assert.ok(deps['@sentry/node'], '@sentry/node must be installed (AC4)');
});

// ---------- Env schema additions ----------

test('env.config.ts validates SENTRY_DSN, OTEL_EXPORTER_OTLP_ENDPOINT, METRICS_BASIC_AUTH_*', () => {
  const env = readFileSync(resolve(apiSrc, 'common/env.config.ts'), 'utf8');
  assert.match(env, /SENTRY_DSN/, 'env.config.ts must declare SENTRY_DSN (AC4)');
  assert.match(env, /OTEL_EXPORTER_OTLP_ENDPOINT/, 'env.config.ts must declare OTEL_EXPORTER_OTLP_ENDPOINT (AC3)');
  assert.match(env, /METRICS_BASIC_AUTH_USER/, 'env.config.ts must declare METRICS_BASIC_AUTH_USER (AC2)');
  assert.match(env, /METRICS_BASIC_AUTH_PASS/, 'env.config.ts must declare METRICS_BASIC_AUTH_PASS (AC2)');
});

// ---------- pino correlation_id + base fields (AC1) ----------

test('pino logger config attaches correlation_id + module via mixin or genReqId', () => {
  const common = readFileSync(resolve(apiSrc, 'common/common.module.ts'), 'utf8');
  assert.match(common, /correlation_id|genReqId|customProps/, 'CommonModule must wire correlation_id propagation (AC1)');
  assert.match(common, /mixin|customProps|base/, 'CommonModule must inject base log fields like organization_id, user_id (AC1)');
});

// ---------- /metrics module + basic auth (AC2) ----------

test('Metrics module + controller + basic-auth guard exist', () => {
  for (const f of ['metrics.module.ts', 'metrics.controller.ts', 'metrics.service.ts', 'metrics-basic-auth.guard.ts']) {
    assert.ok(existsSync(resolve(apiSrc, 'observability', f)), `apps/api/src/observability/${f} must exist (AC2)`);
  }
  const ctrl = readFileSync(resolve(apiSrc, 'observability/metrics.controller.ts'), 'utf8');
  assert.match(ctrl, /@Controller\(\s*['"]?metrics['"]?\s*\)/, 'MetricsController must be mounted at /metrics (AC2)');
  assert.match(ctrl, /@UseGuards\(\s*MetricsBasicAuthGuard\s*\)/, 'MetricsController must apply MetricsBasicAuthGuard (AC2)');

  const guard = readFileSync(resolve(apiSrc, 'observability/metrics-basic-auth.guard.ts'), 'utf8');
  assert.match(guard, /Authorization|Basic\s/i, 'MetricsBasicAuthGuard must parse Authorization header (AC2)');
});

test('AppModule wires the observability module', () => {
  const app = readFileSync(resolve(apiSrc, 'app.module.ts'), 'utf8');
  assert.match(app, /ObservabilityModule|MetricsModule/, 'AppModule must wire ObservabilityModule or MetricsModule (AC2)');
});

// ---------- OpenTelemetry SDK (AC3) ----------

test('OTel bootstrap file exists and is imported BEFORE NestFactory in main.ts', () => {
  const otel = resolve(apiSrc, 'observability/tracing.ts');
  assert.ok(existsSync(otel), 'apps/api/src/observability/tracing.ts must exist (AC3)');
  const otelSrc = readFileSync(otel, 'utf8');
  assert.match(otelSrc, /NodeSDK|@opentelemetry\/sdk-node/, 'tracing.ts must initialize @opentelemetry/sdk-node (AC3)');
  assert.match(otelSrc, /OTLP/, 'tracing.ts must reference OTLP exporter (AC3)');

  const main = readFileSync(resolve(apiSrc, 'main.ts'), 'utf8');
  // The tracing module must be imported at the TOP so instrumentation patches happen
  // before any other module is loaded. Side-effect-only `import './path.js'` form
  // is the canonical shape for SDK bootstraps (no named exports to consume here).
  const tracingImportIdx = main.search(/import\s+['"]\.\/observability\/tracing|from\s+['"]\.\/observability\/tracing/);
  const appModuleImportIdx = main.search(/from\s+['"]\.\/app\.module/);
  assert.ok(tracingImportIdx >= 0, 'main.ts must import the tracing bootstrap (AC3)');
  assert.ok(
    tracingImportIdx < appModuleImportIdx,
    'tracing bootstrap must be imported BEFORE app.module so instrumentation patches load first (AC3)',
  );
});

// ---------- Sentry (AC4) ----------

test('Sentry init exists for the API and is imported BEFORE NestFactory', () => {
  const sentry = resolve(apiSrc, 'observability/sentry.ts');
  assert.ok(existsSync(sentry), 'apps/api/src/observability/sentry.ts must exist (AC4)');
  const sentrySrc = readFileSync(sentry, 'utf8');
  assert.match(sentrySrc, /@sentry\/node/, 'sentry.ts must use @sentry/node (AC4)');
  assert.match(sentrySrc, /Sentry\.init/, 'sentry.ts must call Sentry.init (AC4)');

  const main = readFileSync(resolve(apiSrc, 'main.ts'), 'utf8');
  // Side-effect-only import is the correct shape for the Sentry bootstrap — it
  // initializes via top-level Sentry.init and has no named exports we need here.
  assert.match(
    main,
    /import\s+['"]\.\/observability\/sentry(?:\.js)?['"]|from\s+['"]\.\/observability\/sentry/,
    'main.ts must import the sentry bootstrap (AC4)',
  );
});

test('apps/web declares @sentry/nextjs + has instrumentation.ts', () => {
  const pkg = JSON.parse(readFileSync(resolve(web, 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.ok(deps['@sentry/nextjs'], '@sentry/nextjs must be installed (AC4)');

  // Next.js 14 / 15 Sentry uses instrumentation.ts at the project root (or src/) +
  // sentry.client.config.ts / sentry.server.config.ts (or .edge.config.ts).
  const instrumentationCandidates = [
    resolve(web, 'instrumentation.ts'),
    resolve(web, 'src/instrumentation.ts'),
  ];
  const found = instrumentationCandidates.some((p) => existsSync(p));
  assert.ok(found, 'apps/web/instrumentation.ts (or src/instrumentation.ts) must exist (AC4)');

  // At least one Sentry config file must be present.
  const clientConfig = ['sentry.client.config.ts', 'sentry.client.config.js'].some((f) =>
    existsSync(resolve(web, f)),
  );
  const serverConfig = ['sentry.server.config.ts', 'sentry.server.config.js'].some((f) =>
    existsSync(resolve(web, f)),
  );
  assert.ok(clientConfig && serverConfig, 'apps/web must have sentry.client.config.ts and sentry.server.config.ts (AC4)');
});
