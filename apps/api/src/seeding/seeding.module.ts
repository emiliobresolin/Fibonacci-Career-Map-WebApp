import { Module } from '@nestjs/common';

import { SeedingService } from './seeding.service.js';

/**
 * Seeding module (Story 6-3). Owns the one-shot CDF defaults seeder
 * for newly-provisioned organizations. The service is exported so
 * the future first-admin bootstrap flow (Story 6-4) and operator-
 * driven re-seed tooling can call it from in-process.
 *
 * The seeder is a privileged orchestrator (not a CRUD surface), so
 * it talks to PrismaService + withOrgScope directly rather than
 * going through the configuration repositories — using the repos
 * would lose transactional atomicity (each repo opens its own
 * withOrgScope tx). Documented in `seeding.service.ts`.
 */
@Module({
  providers: [SeedingService],
  exports: [SeedingService],
})
export class SeedingModule {}
