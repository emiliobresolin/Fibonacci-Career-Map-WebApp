import { Module } from '@nestjs/common';

import { SessionStoreService } from './session-store.service.js';

/**
 * Session-store infrastructure module (Story 2-3). Provides the Redis-
 * backed session anchor used by the auth surface for jti registration
 * + forced logout.
 *
 * The admin revoke controller (SessionsController) lives in AuthModule
 * to avoid a circular module dependency — AuthModule needs
 * SessionStoreService for login/refresh jti registration, and the
 * revoke controller needs JwtService for inline role gating.
 */
@Module({
  providers: [SessionStoreService],
  exports: [SessionStoreService],
})
export class SessionsModule {}
