import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaService } from './prisma.service.js';
import { RlsContextInterceptor } from './rls-context.interceptor.js';

// @Global so PrismaService is injectable from every domain module without a
// per-module import — the data layer is a cross-cutting concern, not a feature.
// Single exported module per AC3 — all DB access flows through PrismaService.
//
// Story 2-6 wires `RlsContextInterceptor` as a global APP_INTERCEPTOR so every
// HTTP request runs inside an `RlsScope.run` AsyncLocalStorage frame. Domain
// services then call `withOrgScope(prisma, RlsScope.current()!, fn)` to issue
// `SET LOCAL app.current_org_id` for RLS-bound queries.
@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RlsContextInterceptor,
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
