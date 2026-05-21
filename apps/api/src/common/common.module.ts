import { randomUUID } from 'node:crypto';

import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';
import { LoggerModule } from 'nestjs-pino';

import { validateEnv, type Env } from './env.config.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // The Zod schema returns coerced values (PORT as number, NODE_ENV/LOG_LEVEL
      // narrowed to enums). @nestjs/config replaces its internal config with the
      // return value, so ConfigService.get returns properly-typed values downstream.
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const level = config.get('LOG_LEVEL');
        const nodeEnv = config.get('NODE_ENV');
        const apiMode = config.get('API_MODE');
        const pretty = nodeEnv === 'development' || nodeEnv === 'test';

        const basePinoHttp = {
          level,
          // Base fields stamped on EVERY log line (PRD §11 / NFR-6.1):
          //   service / mode / env so cross-service queries in the aggregator work.
          base: {
            service: 'fcm-api',
            mode: apiMode,
            env: nodeEnv,
          },
          // Per-request fields: correlation_id from inbound X-Request-Id (or a
          // newly generated UUID), plus OTel trace_id / span_id so log lines join
          // tightly to spans in the observability stack.
          genReqId: (req: { headers: Record<string, string | string[] | undefined> }): string => {
            const existing = req.headers['x-request-id'];
            const id = Array.isArray(existing) ? existing[0] : existing;
            return id ?? randomUUID();
          },
          customProps: (req: { id?: string | number | object }) => {
            const span = trace.getActiveSpan();
            const ctx = span?.spanContext();
            return {
              correlation_id: typeof req.id === 'string' ? req.id : String(req.id ?? ''),
              // user_id and organization_id land here once auth is wired (Story
              // 2.x). Stamping them as null today so log consumers can build
              // dashboards against stable field names from day one.
              user_id: null as string | null,
              organization_id: null as string | null,
              module: 'http',
              ...(ctx ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {}),
            };
          },
          serializers: {
            req: (req: { id?: string | number | object; method?: string; url?: string }) => ({
              id: typeof req.id === 'string' ? req.id : String(req.id ?? ''),
              method: req.method,
              url: req.url,
            }),
            res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-api-key"]',
              // set-cookie is a RESPONSE header (Node HTTP normalizes it to a
              // string[]); the previous path under req.headers was dead code.
              'res.headers["set-cookie"]',
            ],
            censor: '[redacted]',
          },
        };

        return {
          pinoHttp: pretty
            ? {
                ...basePinoHttp,
                transport: { target: 'pino-pretty', options: { singleLine: true } },
              }
            : basePinoHttp,
        };
      },
    }),
  ],
  exports: [ConfigModule, LoggerModule],
})
export class CommonModule {}
