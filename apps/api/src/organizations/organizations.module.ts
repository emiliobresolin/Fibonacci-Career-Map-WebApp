import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { SeedingModule } from '../seeding/seeding.module.js';
import { BootstrapService } from './bootstrap.service.js';
import { InternalProvisioningGuard } from './internal-provisioning.guard.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

/**
 * Story 6-1 + 6-4 — organization provisioning module.
 *
 * Exposes POST /v1/organizations (bare org) and POST /v1/organizations/bootstrap
 * (first-admin bootstrap composite) for bootstrap tooling. The guard is
 * registered as a provider (not via APP_GUARD) because it's
 * endpoint-specific — every other route uses the global JwtAuthGuard.
 *
 * BootstrapService (Story 6-4) needs SeedingService + BootstrapCredentialsService
 * + RecoveryCodesService, so AuthModule + SeedingModule are imported here.
 * AuthModule already exports the two credential services; SeedingModule
 * exports the seeder.
 *
 * OrganizationsService is exported so the SeedingService (Story 6-3) and
 * future surfaces (org-settings controllers) can call provision() from
 * in-process without going back out through the HTTP layer.
 */
@Module({
  imports: [AuthModule, SeedingModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, BootstrapService, InternalProvisioningGuard],
  exports: [OrganizationsService, BootstrapService],
})
export class OrganizationsModule {}
