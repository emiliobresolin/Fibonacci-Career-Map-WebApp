import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

// IMPORTANT: this module MUST be imported at the very top of main.ts, before any
// other module load. OpenTelemetry's auto-instrumentation works by monkey-patching
// modules (http, express, pg, redis, ...) on their first require/import — if Nest /
// Prisma / Pino load first, the patches miss them and you get traces with gaps.

const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
const serviceName = process.env['OTEL_SERVICE_NAME'] ?? 'fcm-api';
const apiMode = process.env['API_MODE'] ?? 'api';
const env = process.env['NODE_ENV'] ?? 'development';

if (!endpoint) {
  // Self-disable when the collector endpoint is unset. The app remains traceable
  // through Sentry / logs; OTel just won't ship spans.
  process.stdout.write(
    JSON.stringify({
      level: 30,
      msg: 'OpenTelemetry disabled — OTEL_EXPORTER_OTLP_ENDPOINT not set',
      service: serviceName,
    }) + '\n',
  );
} else {
  if (env !== 'production') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
  }

  // OTel reads OTEL_RESOURCE_ATTRIBUTES at SDK startup and merges them into the
  // service Resource. We set extra attrs here (api_mode, deployment.environment)
  // so the OTel collector sees them on every span without needing a Resource
  // import (which has shifted across @opentelemetry/resources versions).
  // SERVICE_VERSION is baked into the runtime image at build time via Docker
  // ARG (CI sets it to the commit SHA — see apps/api/Dockerfile). The
  // npm_package_version env var is only populated when invoked through pnpm/npm
  // scripts; production runs `node dist/main.js` directly so we cannot rely on
  // it. The fallback to '0.0.0' is only for local dev where SERVICE_VERSION is
  // unset; CI deploys must always set it.
  const extraAttrs = [
    `service.version=${process.env['SERVICE_VERSION'] ?? '0.0.0'}`,
    `fcm.api_mode=${apiMode}`,
    `deployment.environment=${env}`,
  ];
  const existing = process.env['OTEL_RESOURCE_ATTRIBUTES'];
  process.env['OTEL_RESOURCE_ATTRIBUTES'] = existing
    ? `${existing},${extraAttrs.join(',')}`
    : extraAttrs.join(',');

  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Pino's standard http logs are already structured; the otel-pino instrumentation
        // would double-log every request. Disable it.
        '@opentelemetry/instrumentation-pino': { enabled: false },
        // fs is noisy and rarely actionable; mute by default.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Graceful flush on shutdown. NestJS `enableShutdownHooks` will fire SIGTERM
  // handlers; we tie into the process directly here because the SDK is initialized
  // before NestFactory and outlives the Nest app lifecycle.
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    try {
      await sdk.shutdown();
    } catch (err) {
      process.stderr.write(`OTel shutdown failed on ${signal}: ${String(err)}\n`);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}
