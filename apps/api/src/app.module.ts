import { Module, type DynamicModule } from '@nestjs/common';

import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { OutboxModule } from './outbox/outbox.module.js';
import { PartitionsModule } from './partitions/partitions.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

export type ApiMode = 'api' | 'worker';

/**
 * AppModule is a DynamicModule rather than a static class so the `mode` flag
 * is an explicit constructor input rather than a `process.env` read at module-
 * load time. The old shape silently coerced a typo (`API_MODE=Worker`) into
 * api-mode because the import-side ternary couldn't validate; this shape
 * forces `main.ts` to compute the mode from the Zod-validated env before
 * constructing the module. Tests that boot AppModule directly do the same.
 *
 * JobsModule registration is mode-aware: both modes need queue producers,
 * but only worker mode registers consumer providers (Story 4-1 AC2).
 */
@Module({})
export class AppModule {
  static register(opts: { mode: ApiMode }): DynamicModule {
    return {
      module: AppModule,
      imports: [
        CommonModule,
        ObservabilityModule,
        PrismaModule,
        AuthModule,
        JobsModule.register({ mode: opts.mode }),
        OutboxModule.register({ mode: opts.mode }),
        PartitionsModule.register({ mode: opts.mode }),
        AuditModule,
        RealtimeModule.register({ mode: opts.mode }),
        HealthModule,
      ],
    };
  }
}
