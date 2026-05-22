import { Module } from '@nestjs/common';

import { BlockersController } from './blockers.controller.js';
import { BlockersRepository } from './blockers.repository.js';
import { EmployeesRepository } from './employees.repository.js';

/**
 * Identity module (Story 6-2a + 6-2b, Arch §6.2).
 *
 * Owns `employees` + `employee_assignments` + `employee_blockers`.
 * Every reader and writer of those tables goes through one of the
 * exported repositories — direct PrismaService access from outside
 * the module violates the Arch §5.1 modular-monolith boundary.
 *
 * The 6-2b admin API (`POST /v1/employees/:id/blockers`,
 * `PATCH /v1/blockers/:id/resolve`) is wired here as a co-located
 * controller; the rest of identity surfaces (employee CRUD, manager
 * graph queries) land in Epic 7+ as service-layer wrappers around
 * EmployeesRepository.
 */
@Module({
  controllers: [BlockersController],
  providers: [EmployeesRepository, BlockersRepository],
  exports: [EmployeesRepository, BlockersRepository],
})
export class IdentityModule {}
