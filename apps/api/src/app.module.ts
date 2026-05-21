import { Module } from '@nestjs/common';

import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [CommonModule, ObservabilityModule, PrismaModule, HealthModule],
})
export class AppModule {}
