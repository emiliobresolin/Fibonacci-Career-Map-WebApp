import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
        // Explicit allow-list (not "anything but production") so a misconfigured env
        // with NODE_ENV unset or typo'd never falls through to pretty-print in a
        // real deploy. pino-pretty lives in devDependencies, so attempting to load
        // it without the dev install will fail loudly — the desired safety.
        const pretty = nodeEnv === 'development' || nodeEnv === 'test';
        return {
          pinoHttp: pretty
            ? { level, transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : { level },
        };
      },
    }),
  ],
  exports: [ConfigModule, LoggerModule],
})
export class CommonModule {}
