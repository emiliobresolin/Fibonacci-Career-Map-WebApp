import { Module } from '@nestjs/common';

import { BlockersController } from './blockers.controller.js';
import { BlockersRepository } from './blockers.repository.js';
import { EmployeeImportController } from './employee-import.controller.js';
import { EmployeeImportService } from './employee-import.service.js';
import { EmployeesRepository } from './employees.repository.js';

/**
 * Identity module (Story 6-2a + 6-2b + 6-5, Arch §6.2).
 *
 * Owns `employees` + `employee_assignments` + `employee_blockers`.
 * Every reader and writer of those tables goes through one of the
 * exported repositories — direct PrismaService access from outside
 * the module violates the Arch §5.1 modular-monolith boundary.
 *
 * Surfaces wired here:
 *   • 6-2b: POST /v1/employees/:id/blockers + PATCH /v1/blockers/:id/resolve
 *   • 6-5:  POST /v1/employees/bulk-import (CSV roster import)
 *
 * The EmployeeImportService talks to Prisma directly (not through
 * EmployeesRepository) because the import is a privileged ADMIN
 * orchestrator that must write hundreds of rows in ONE transaction
 * to satisfy AC6. The per-row repository methods open their own
 * transactions, which would lose batch atomicity. Same pattern as
 * SeedingService (Story 6-3).
 */
@Module({
  controllers: [BlockersController, EmployeeImportController],
  providers: [EmployeesRepository, BlockersRepository, EmployeeImportService],
  exports: [EmployeesRepository, BlockersRepository, EmployeeImportService],
})
export class IdentityModule {}
