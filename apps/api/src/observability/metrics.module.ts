import { Module } from '@nestjs/common';

import { MetricsBasicAuthGuard } from './metrics-basic-auth.guard.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

// Mounted by AppModule alongside HealthModule. The MetricsService Registry is
// exported so future feature modules can register their own metrics against it
// (custom counters/histograms for evidence approvals, scoring duration, etc.).
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsBasicAuthGuard],
  exports: [MetricsService],
})
export class MetricsModule {}
