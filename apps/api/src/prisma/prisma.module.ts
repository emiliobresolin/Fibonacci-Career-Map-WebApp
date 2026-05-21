import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

// @Global so PrismaService is injectable from every domain module without a
// per-module import — the data layer is a cross-cutting concern, not a feature.
// Single exported module per AC3 — all DB access flows through PrismaService.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
