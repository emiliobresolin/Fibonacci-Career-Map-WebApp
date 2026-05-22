import { Module } from '@nestjs/common';

import { EmployeesRepository } from './employees.repository.js';

/**
 * Identity module (Story 6-2a, Arch §6.2).
 *
 * Owns `employees` + `employee_assignments`. AC4: every reader and
 * writer of these tables goes through `EmployeesRepository` —
 * direct PrismaService access from outside the module violates
 * the Arch §5.1 modular-monolith boundary.
 *
 * Epic 6-5 (CSV bulk import) + Epic 7 (configuration CRUD) +
 * Epic 8 (evidence) + Epic 9 (scoring) + Epic 13 (promotion) will
 * inject this repo. Story 6-3 (SeedingService) is the first
 * consumer.
 */
@Module({
  providers: [EmployeesRepository],
  exports: [EmployeesRepository],
})
export class IdentityModule {}
