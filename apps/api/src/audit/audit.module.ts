import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

/**
 * Audit-read API module (Story 3-5). The audit-WRITE path lives in
 * OutboxModule (relay worker) — this module owns the read surface.
 *
 * Imports AuthModule for JwtService (inline bearer-token decode until
 * Story 2-4 ships the global AuthGuard).
 */
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
