import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { ReadinessController } from './readiness.controller.js';

@Module({
  controllers: [HealthController, ReadinessController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
