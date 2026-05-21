import { Module } from '@nestjs/common';

import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [CommonModule, HealthModule],
})
export class AppModule {}
