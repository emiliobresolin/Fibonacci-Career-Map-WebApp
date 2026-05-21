import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [CommonModule, ObservabilityModule, PrismaModule, AuthModule, HealthModule],
})
export class AppModule {}
