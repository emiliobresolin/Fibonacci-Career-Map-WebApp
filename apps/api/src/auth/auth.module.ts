import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { SessionsModule } from '../sessions/sessions.module.js';
import { SessionsController } from '../sessions/sessions.controller.js';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './auth.guard.js';
import { BootstrapCredentialsService } from './bootstrap-credentials.service.js';
import { JwtService } from './jwt.service.js';
import { OidcStateStore } from './oidc-state.store.js';
import { OidcService } from './oidc.service.js';
import { RecoveryCodesService } from './recovery-codes.service.js';

/**
 * AuthModule wires the global Layer-1 AuthGuard (Story 2-4). Registering
 * the guard via APP_GUARD here — rather than UseGuards on each controller —
 * locks in the closed-by-default contract: a new route is authenticated
 * unless it explicitly opts out with `@Public()`.
 *
 * Story 2-7: BootstrapCredentialsService + RecoveryCodesService are
 * exported so the future SeedingService (Epic 6 org provisioning) can
 * call them during initial org setup.
 */
@Module({
  imports: [SessionsModule],
  controllers: [AuthController, SessionsController],
  providers: [
    OidcService,
    OidcStateStore,
    JwtService,
    BootstrapCredentialsService,
    RecoveryCodesService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [JwtService, BootstrapCredentialsService, RecoveryCodesService],
})
export class AuthModule {}
