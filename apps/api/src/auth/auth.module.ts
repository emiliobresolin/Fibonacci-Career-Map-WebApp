import { Module } from '@nestjs/common';

import { SessionsModule } from '../sessions/sessions.module.js';
import { SessionsController } from '../sessions/sessions.controller.js';
import { AuthController } from './auth.controller.js';
import { JwtService } from './jwt.service.js';
import { OidcStateStore } from './oidc-state.store.js';
import { OidcService } from './oidc.service.js';

@Module({
  imports: [SessionsModule],
  controllers: [AuthController, SessionsController],
  providers: [OidcService, OidcStateStore, JwtService],
  exports: [JwtService],
})
export class AuthModule {}
