import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../common/env.config.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type DependencyStatus = 'ok' | 'down' | 'not_configured';

export type DependencyCheck = {
  name: 'postgres' | 'redis' | 'oidc';
  status: DependencyStatus;
  detail?: string;
  latencyMs?: number;
};

export type ReadinessReport = {
  ready: boolean;
  checks: DependencyCheck[];
};

/**
 * HealthService runs cheap parallel health checks against the three external
 * dependencies the API needs to serve traffic: Postgres (Prisma), Redis (cache /
 * BullMQ — wired in EPIC-4), and the OIDC discovery document (wired in EPIC-2).
 *
 * Each check has three states:
 *   - 'ok'              the dependency answered within the timeout
 *   - 'down'            the dependency was expected to be reachable but failed
 *   - 'not_configured'  the dependency isn't expected to be wired yet (e.g.,
 *                       Redis before EPIC-4); treated as ok for the overall ready=true
 *                       calculation but reported so operators see the gap
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async check(): Promise<ReadinessReport> {
    const checks = await Promise.all([this.checkPostgres(), this.checkRedis(), this.checkOidc()]);
    // 'down' is the only state that flips ready=false; 'not_configured' is
    // expected for dependencies that haven't been wired yet.
    const ready = checks.every((c) => c.status !== 'down');
    return { ready, checks };
  }

  private async checkPostgres(): Promise<DependencyCheck> {
    if (!this.config.get('DATABASE_URL')) {
      return { name: 'postgres', status: 'not_configured', detail: 'DATABASE_URL unset' };
    }
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { name: 'postgres', status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.warn(`postgres health check failed: ${String(err)}`);
      return {
        name: 'postgres',
        status: 'down',
        detail: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      };
    }
  }

  private async checkRedis(): Promise<DependencyCheck> {
    // Redis client lands with EPIC-4 (BullMQ). Until then, report not_configured
    // so /readyz returns 200 in dev/test and the ungrounded-dep gap is visible.
    return { name: 'redis', status: 'not_configured', detail: 'Redis client lands in EPIC-4' };
  }

  private async checkOidc(): Promise<DependencyCheck> {
    // OIDC discovery URL lands with EPIC-2 (Identity). Until then, report
    // not_configured so /readyz returns 200 in dev/test.
    return { name: 'oidc', status: 'not_configured', detail: 'OIDC discovery wired in EPIC-2' };
  }
}
