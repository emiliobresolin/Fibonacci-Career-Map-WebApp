import { Module } from '@nestjs/common';

import { InternalProvisioningGuard } from './internal-provisioning.guard.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

/**
 * Story 6-1 — organization provisioning module.
 *
 * Exposes POST /v1/organizations for bootstrap tooling. The guard is
 * registered as a provider (not via APP_GUARD) because it's
 * endpoint-specific — every other route uses the global JwtAuthGuard.
 *
 * OrganizationsService is exported so the future SeedingService
 * (Story 6-3) can call provision() from the in-process bootstrap path
 * without going back out through the HTTP layer.
 */
@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, InternalProvisioningGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
