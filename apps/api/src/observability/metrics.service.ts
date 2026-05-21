import { Injectable, type OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Registry } from 'prom-client';

// Single Registry owned by this service so feature modules can `register.registerMetric(...)`
// against it as they add domain-specific counters/histograms in later stories.

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  onModuleInit(): void {
    // Default Node + process metrics (event loop lag, GC, heap, etc.) — the
    // baseline operators expect on every Prometheus dashboard.
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'fcm_api_',
    });
    this.registry.setDefaultLabels({
      app: 'fcm',
      mode: process.env['API_MODE'] ?? 'api',
    });
  }

  async snapshot(): Promise<{ contentType: string; body: string }> {
    return {
      contentType: this.registry.contentType,
      body: await this.registry.metrics(),
    };
  }
}
