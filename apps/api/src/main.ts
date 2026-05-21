// CRITICAL: tracing.ts and sentry.ts MUST import before anything else so OTel's
// auto-instrumentation and Sentry's wrappers patch modules at first require/import.
// Reordering these is a story-1-7 regression that will produce traces with gaps
// and Sentry events without breadcrumbs.
import './observability/tracing.js';
import './observability/sentry.js';

import 'reflect-metadata';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { validateEnv } from './common/env.config.js';
import { startWorkerHeartbeat } from './observability/worker-heartbeat.js';

async function bootstrap(): Promise<void> {
  // Single source of truth for env validation. Same Zod schema is also wired into
  // ConfigModule.forRoot({ validate }) so internal NestJS code reads the same
  // coerced values via ConfigService. This branches BEFORE NestFactory boots so an
  // invalid API_MODE is reported with a structured error and never starts a Nest app.
  const env = validateEnv(process.env);

  let app: INestApplicationContext;

  const appModule = AppModule.register({ mode: env.API_MODE });

  if (env.API_MODE === 'api') {
    const httpApp = await NestFactory.create<NestExpressApplication>(appModule, {
      bufferLogs: true,
    });
    httpApp.useLogger(httpApp.get(Logger));
    httpApp.flushLogs();
    await httpApp.listen(env.PORT);
    httpApp.get(Logger).log(`api-mode ready: listening on port ${env.PORT}`, 'Bootstrap');
    app = httpApp;
  } else {
    app = await NestFactory.createApplicationContext(appModule, {
      bufferLogs: true,
    });
    app.useLogger(app.get(Logger));
    app.flushLogs();
    // Worker heartbeat (Story 1-8 AC3) — emits a prom gauge + heartbeat file
    // every 30s. K8s livenessProbe checks the file's mtime; the Prometheus
    // alert defined in EPIC-16 fires when the gauge value is > 120s stale.
    startWorkerHeartbeat();
    app.get(Logger).log('worker-mode ready', 'Bootstrap');
  }

  // Shared graceful-shutdown path — identical for both modes (AD-1 invariant).
  // Nest's enableShutdownHooks installs SIGTERM/SIGINT/SIGHUP/SIGQUIT handlers, calls
  // app.close() which fires onModuleDestroy / onApplicationShutdown across the module
  // graph (including LoggerModule's pino flush + PrismaService's $disconnect), then
  // re-emits the signal so the process exits with the conventional exit code.
  app.enableShutdownHooks();
}

bootstrap().catch((err: unknown) => {
  process.stderr.write(`Bootstrap failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
