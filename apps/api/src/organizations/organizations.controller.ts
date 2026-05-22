import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';

import { Public } from '../auth/public.decorator.js';
import { InternalProvisioningGuard } from './internal-provisioning.guard.js';
import {
  OrganizationsService,
  type ProvisionedOrganization,
  type ProvisionInput,
} from './organizations.service.js';

type ProvisionDto = ProvisionInput;

/**
 * Story 6-1 — POST /v1/organizations.
 *
 * AC2: privileged-internal-only. The endpoint is gated by
 * `InternalProvisioningGuard`, which checks `X-Internal-Token` against
 * the env-configured shared secret. The global JwtAuthGuard is
 * short-circuited via `@Public()` because there's no tenant JWT at
 * provision time — the very first org doesn't exist yet.
 *
 * AC3 of role-scoped public routes (Story 2-4 follow-up): `@Public()`
 * is applied per-handler rather than class-level so future additions
 * to this controller (e.g. a future PATCH /v1/organizations/:id
 * surface tied to tenant-Admin auth) don't silently inherit the
 * open-by-default opt-out.
 */
@Controller('v1/organizations')
export class OrganizationsController {
  constructor(
    @Inject(OrganizationsService) private readonly organizations: OrganizationsService,
  ) {}

  @Post()
  @Public()
  @UseGuards(InternalProvisioningGuard)
  @HttpCode(201)
  async create(@Body() dto: ProvisionDto): Promise<ProvisionedOrganization> {
    return this.organizations.provision({
      slug: dto?.slug ?? '',
      name: dto?.name ?? '',
    });
  }
}
