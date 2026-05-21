import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';
import { JwtService } from './jwt.service.js';
import { OidcStateStore } from './oidc-state.store.js';
import { OidcService } from './oidc.service.js';

@Module({
  controllers: [AuthController],
  providers: [OidcService, OidcStateStore, JwtService],
  exports: [JwtService],
})
export class AuthModule {}
