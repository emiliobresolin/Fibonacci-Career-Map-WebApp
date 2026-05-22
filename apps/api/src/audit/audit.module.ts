import { Module } from '@nestjs/common';

import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

/**
 * Audit-read API module (Story 3-5). The audit-WRITE path lives in
 * OutboxModule (relay worker) — this module owns the read surface.
 *
 * Story 2-4 swap: the global JwtAuthGuard handles bearer-token decode
 * + role gating, so this module no longer pulls AuthModule/SessionsModule
 * for inline auth.
 */
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
