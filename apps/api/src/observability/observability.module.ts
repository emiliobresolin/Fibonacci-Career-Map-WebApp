import { Module } from '@nestjs/common';

import { MetricsModule } from './metrics.module.js';

// Aggregates all the observability surfaces that live INSIDE the Nest DI graph.
// The OTel SDK + Sentry init are NOT part of this module — they run before
// NestFactory boots (see main.ts top-of-file imports) so they can patch modules
// before they're loaded.
@Module({
  imports: [MetricsModule],
  exports: [MetricsModule],
})
export class ObservabilityModule {}
