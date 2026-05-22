import { SetMetadata } from '@nestjs/common';

import { ROLES, type Role } from './auth.types.js';

export const ROLES_KEY = 'auth:roles';

/**
 * Restricts a handler (or whole controller) to one or more roles. The
 * global AuthGuard reads this metadata after the JWT has been verified
 * and `request.user.role` populated.
 *
 *   @Roles('ADMIN')               // admin only
 *   @Roles('MANAGER', 'ADMIN')    // either role permitted
 *
 * No annotation = authenticated-only (any role passes).
 */
export const Roles = (...allowed: Role[]): MethodDecorator & ClassDecorator => {
  // Defensive: catch typos at module-load time rather than 500-ing per request.
  for (const r of allowed) {
    if (!ROLES.includes(r)) {
      throw new Error(`@Roles received unknown role: ${String(r)}`);
    }
  }
  return SetMetadata(ROLES_KEY, allowed);
};
