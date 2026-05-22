import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';

import { BootstrapCredentialsService } from '../auth/bootstrap-credentials.service.js';
import { RecoveryCodesService } from '../auth/recovery-codes.service.js';
import { SeedingService } from '../seeding/seeding.service.js';
import {
  OrganizationsService,
  type ProvisionedOrganization,
} from './organizations.service.js';

export type BootstrapInput = {
  slug: string;
  name: string;
};

export type BootstrapResult = {
  organization: ProvisionedOrganization;
  /** Plaintext credentials surfaced ONCE. Caller MUST hand them off via a
   *  secure channel (operator runbook). The DB stores only the scrypt hash. */
  credentials: {
    username: string;
    password: string;
    userId: string;
  };
  /** 10 single-use OIDC-outage recovery codes. Plaintext, returned ONCE.
   *  Same handling discipline as `credentials`. */
  recoveryCodes: string[];
};

/**
 * Story 6-4 — first-admin bootstrap orchestrator.
 *
 * Composes four already-tested building blocks into one bootstrap flow:
 *
 *   1. `OrganizationsService.provision(slug, name)` — creates the org
 *      with PRD-mandated defaults and emits `organization.created`.
 *   2. `SeedingService.seedOrganization(orgId)` — installs CDF
 *      (3 tracks × levels × layers × requirements × promotion rules)
 *      and emits one `configuration.seeded` per row.
 *   3. `BootstrapCredentialsService.provision(orgId)` — creates the
 *      bootstrap admin (user + role_assignment + bootstrap_credential)
 *      and emits `bootstrap_admin.provisioned`.
 *   4. `RecoveryCodesService.provisionBatch(orgId)` — issues 10
 *      single-use codes and emits `recovery_codes.provisioned`.
 *
 * AC2 ("refuses to recreate"): slug uniqueness at step (1) is the
 * guard. A second call with the same slug surfaces as 409 from
 * OrganizationsService before any of the downstream steps run. The
 * existing self-retirement (Story 2-7 AC2, wired in
 * auth.controller.ts after a first OIDC ADMIN sign-in) is the
 * complementary half — once retired, the bootstrap row stays in the
 * DB, and a re-bootstrap would 409 at step (1) regardless.
 *
 * Atomicity: the four steps each run in their own `withOrgScope`
 * transaction (each service owns its own atomicity). Partial-failure
 * mode: if step (2)/(3)/(4) fails after step (1) committed, the org
 * row + `organization.created` audit event remain. Recovery requires
 * a two-step DELETE because `users.organization_id` is declared
 * `onDelete: Restrict` in the Prisma schema (see schema.prisma:142)
 * — a single `DELETE FROM organizations` will hit FK violation if
 * step (3) created the bootstrap-admin User row. The operator
 * runbook (deferred-work follow-up F6-4) prescribes:
 *
 *     -- ① cascades to role_assignments, employees, employee_assignments
 *     DELETE FROM users WHERE organization_id = '<orgId>';
 *     -- ② now satisfies the Restrict FK; cascades to bootstrap_credentials,
 *     --   recovery_codes, career_tracks, levels, layers, requirements,
 *     --   promotion_rules
 *     DELETE FROM organizations WHERE id = '<orgId>';
 *
 * audit_events rows from step (1)/(2) remain (append-only retention);
 * a forensic trail of the failed bootstrap is preserved.
 *
 * The trade-off vs. wrapping all four steps in one tx:
 *   • The most common failure (step 1: slug collision) happens BEFORE
 *     any other write — no partial state, no recovery needed.
 *   • Steps 2–4 are deterministic given a valid org id; a real failure
 *     is a transient DB error, not a logic bug.
 *   • Wrapping all four in one tx would require the services to share
 *     a transaction handle, crossing the modular-monolith boundary
 *     (Arch §5.1) and breaking each service's atomicity in isolation.
 *   • The two-step recovery is documented + scripted; the partial-
 *     failure rate in practice is near-zero.
 *
 * Caller contract: returns the plaintext credentials + 10 recovery
 * codes ONCE. The operator is responsible for handing them to the
 * first admin via a secure channel. The DB stores only hashes.
 */
@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    @Inject(OrganizationsService) private readonly organizations: OrganizationsService,
    @Inject(SeedingService) private readonly seeding: SeedingService,
    @Inject(BootstrapCredentialsService) private readonly bootstrapCredentials: BootstrapCredentialsService,
    @Inject(RecoveryCodesService) private readonly recovery: RecoveryCodesService,
  ) {}

  async bootstrap(input: BootstrapInput): Promise<BootstrapResult> {
    // Step 1: provision the org. Slug-collision 409 surfaces here
    // (AC2 "refuses to recreate").
    const org = await this.organizations.provision({
      slug: input.slug,
      name: input.name,
    });
    this.logger.log({ op: 'bootstrap.provision', orgId: org.id, slug: org.slug }, 'org provisioned');

    // Step 2: seed CDF. AlreadySeededError cannot occur because we
    // just created the org in step 1 — but we surface it as 409 if it
    // somehow did, matching the bootstrap-rejection semantics.
    try {
      await this.seeding.seedOrganization(org.id);
    } catch (err) {
      if (err instanceof Error && err.name === 'AlreadySeededError') {
        throw new ConflictException({
          error: 'conflict',
          message: `Organization ${org.slug} is already bootstrapped`,
        });
      }
      throw err;
    }
    this.logger.log({ op: 'bootstrap.seed', orgId: org.id }, 'CDF seeded');

    // Step 3: bootstrap admin user + credential.
    const credentials = await this.bootstrapCredentials.provision(org.id);
    this.logger.log({ op: 'bootstrap.admin', orgId: org.id, userId: credentials.userId }, 'bootstrap admin provisioned');

    // Step 4: 10 single-use recovery codes.
    const recoveryCodes = await this.recovery.provisionBatch(org.id);
    this.logger.log({ op: 'bootstrap.recovery', orgId: org.id, count: recoveryCodes.length }, 'recovery codes provisioned');

    return {
      organization: org,
      credentials,
      recoveryCodes,
    };
  }
}
