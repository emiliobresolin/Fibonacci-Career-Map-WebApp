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
import { parseOrigins, validateEnv } from './common/env.config.js';
import { startWorkerHeartbeat } from './observability/worker-heartbeat.js';
import { RedisIoAdapter } from './realtime/redis-io.adapter.js';

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

    // CORS lock-down (Story 2-4 AC3). Allow-list is config-driven; unlisted
    // origins are rejected by the express `cors` middleware (Nest's default
    // adapter). Empty list → no cross-origin requests succeed, which is the
    // safe default in dev/test where the web hits the api via same-origin
    // proxy through Next's rewrite. credentials:true so the web's session
    // cookie + Authorization header are forwarded.
    const allowedOrigins = parseOrigins(env.CORS_ALLOWED_ORIGINS);
    httpApp.enableCors({
      origin: (origin, cb) => {
        // No Origin header → same-origin, server-to-server, or CLI. Always
        // permitted; CORS only meaningfully restricts browser-driven
        // cross-origin XHRs.
        if (!origin) return cb(null, true);
        const normalised = origin.replace(/\/+$/, '');
        // Reject by calling `cb(null, false)` rather than `cb(new Error(...))`:
        // an error propagates to Express's default handler, which returns 500
        // with the error message in the body (and leaks the rejected origin
        // string). `false` simply omits the Access-Control-Allow-Origin header,
        // which is what the spec mandates and what the browser already knows
        // how to handle — the cross-origin request silently fails CORS at the
        // browser level rather than producing a 500 with sensitive info.
        return cb(null, allowedOrigins.includes(normalised));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    // Story 5-1: Socket.IO server with Redis adapter so multi-replica
    // emits fanout across the cluster. When REDIS_URL is unset (scaffold
    // / non-prod boot path), the adapter stays single-replica — same
    // policy as the BullMQ / SessionStore connections.
    const redisUrl = env.REDIS_URL;
    if (redisUrl) {
      const ioAdapter = new RedisIoAdapter(httpApp);
      await ioAdapter.connectToRedis(redisUrl);
      httpApp.useWebSocketAdapter(ioAdapter);
    } else {
      httpApp.get(Logger).warn(
        'REDIS_URL not set — Socket.IO running single-replica. Production env-validation forbids this path.',
      );
    }

    await httpApp.listen(env.PORT);
    httpApp.get(Logger).log(
      `api-mode ready: listening on port ${env.PORT} (cors allow-list: ${
        allowedOrigins.length > 0 ? allowedOrigins.join(', ') : '<empty>'
      })`,
      'Bootstrap',
    );
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
