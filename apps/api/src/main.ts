import 'reflect-metadata';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { validateEnv } from './common/env.config.js';

async function bootstrap(): Promise<void> {
  // Single source of truth for env validation. Same Zod schema is also wired into
  // ConfigModule.forRoot({ validate }) so internal NestJS code reads the same
  // coerced values via ConfigService. This branches BEFORE NestFactory boots so an
  // invalid API_MODE is reported with a structured error and never starts a Nest app.
  const env = validateEnv(process.env);

  let app: INestApplicationContext;

  if (env.API_MODE === 'api') {
    const httpApp = await NestFactory.create<NestExpressApplication>(AppModule, {
      bufferLogs: true,
    });
    httpApp.useLogger(httpApp.get(Logger));
    httpApp.flushLogs();
    await httpApp.listen(env.PORT);
    httpApp.get(Logger).log(`api-mode ready: listening on port ${env.PORT}`, 'Bootstrap');
    app = httpApp;
  } else {
    app = await NestFactory.createApplicationContext(AppModule, {
      bufferLogs: true,
    });
    app.useLogger(app.get(Logger));
    app.flushLogs();
    app.get(Logger).log('worker-mode ready', 'Bootstrap');
  }

  // Shared graceful-shutdown path — identical for both modes (AD-1 invariant).
  // Nest's enableShutdownHooks installs SIGTERM/SIGINT/SIGHUP/SIGQUIT handlers, calls
  // app.close() which fires onModuleDestroy / onApplicationShutdown across the module
  // graph (including LoggerModule's pino flush), then re-emits the signal so the
  // process exits with the conventional exit code for that signal. A second signal
  // bypasses Nest's now-removed handler and exits immediately via default behaviour,
  // which is what operators expect when force-shutdown is required.
  app.enableShutdownHooks();
}

bootstrap().catch((err: unknown) => {
  process.stderr.write(`Bootstrap failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
