import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import type { Env } from '../common/env.config.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly bootLogger = new Logger(PrismaService.name);

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    // Pass the validated DATABASE_URL explicitly so PrismaClient uses the same value
    // env.config.ts validated — not whatever happens to be in process.env at construction
    // time. Production env validation guarantees DATABASE_URL is present here.
    super({
      datasources: { db: { url: config.get('DATABASE_URL') ?? '' } },
    });
  }

  async onModuleInit(): Promise<void> {
    // Prisma connects lazily on first query. We deliberately do NOT call $connect() so
    // the API boots in environments without a live database (CI typecheck, test spawns,
    // prisma generate). Health probes (Story 1-8) will exercise the connection.
    if (!process.env['DATABASE_URL']) {
      this.bootLogger.warn(
        'DATABASE_URL is not set — Prisma will fail at first query. Acceptable for scaffold/test, never for production.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
