import { Module, type DynamicModule } from '@nestjs/common';

import { RealtimeGateway } from './realtime.gateway.js';

/**
 * RealtimeModule (Story 5-1). API-mode only — workers do not host
 * WebSocket connections. The `register({ mode })` shape mirrors the
 * other dynamic modules (Jobs, Outbox, Partitions) so the AppModule
 * graph stays uniform.
 *
 * The actual Socket.IO server is hung off the HTTP adapter via
 * `app.useWebSocketAdapter(new RedisIoAdapter(app))` in main.ts —
 * this module just registers the gateway provider so Nest knows
 * about the connection lifecycle hooks.
 */
@Module({})
export class RealtimeModule {
  static register(opts: { mode: 'api' | 'worker' }): DynamicModule {
    return {
      module: RealtimeModule,
      providers: opts.mode === 'api' ? [RealtimeGateway] : [],
      exports: opts.mode === 'api' ? [RealtimeGateway] : [],
    };
  }
}
