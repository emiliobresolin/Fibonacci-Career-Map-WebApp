import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';

import { Public } from '../auth/public.decorator.js';
import {
  BootstrapService,
  type BootstrapInput,
  type BootstrapResult,
} from './bootstrap.service.js';
import { InternalProvisioningGuard } from './internal-provisioning.guard.js';
import {
  OrganizationsService,
  type ProvisionedOrganization,
  type ProvisionInput,
} from './organizations.service.js';

type ProvisionDto = ProvisionInput;
type BootstrapDto = BootstrapInput;

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
    @Inject(BootstrapService) private readonly bootstrapService: BootstrapService,
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

  /**
   * Story 6-4 — first-admin bootstrap endpoint.
   *
   * One-shot composite: provision org + seed CDF + create bootstrap admin
   * + issue 10 recovery codes. Same `@Public()` + `InternalProvisioningGuard`
   * gate as the bare-org provisioning endpoint above: at bootstrap time
   * the org has no users yet, so the global JwtAuthGuard cannot
   * authenticate the caller. The shared-secret token is the only auth.
   *
   * AC2 enforcement: a second bootstrap call for the same slug surfaces
   * as 409 from `OrganizationsService.provision` BEFORE any other writes
   * happen.
   *
   * Returns plaintext credentials + 10 recovery codes ONCE. The operator
   * hand-offs the secrets to the first admin via a secure channel; the
   * DB stores only the scrypt hashes.
   */
  @Post('bootstrap')
  @Public()
  @UseGuards(InternalProvisioningGuard)
  @HttpCode(201)
  async createWithBootstrap(@Body() dto: BootstrapDto): Promise<BootstrapResult> {
    return this.bootstrapService.bootstrap({
      slug: dto?.slug ?? '',
      name: dto?.name ?? '',
    });
  }
}
