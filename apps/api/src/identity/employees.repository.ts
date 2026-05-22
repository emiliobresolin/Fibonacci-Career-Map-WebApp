import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';

export type CreateEmployeeInput = {
  userId: string;
  careerTrackId?: string | null;
  levelId?: string | null;
  assignedAt?: Date | null;
};

export type UpdateEmployeeInput = {
  careerTrackId?: string | null;
  levelId?: string | null;
  assignedAt?: Date | null;
  deactivatedAt?: Date | null;
};

export type EmployeeRow = {
  id: string;
  organizationId: string;
  userId: string;
  careerTrackId: string | null;
  levelId: string | null;
  assignedAt: Date | null;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AssignmentRow = {
  id: string;
  employeeId: string;
  organizationId: string;
  role: Role;
  managerEmployeeId: string | null;
  assignedAt: Date;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateAssignmentInput = {
  employeeId: string;
  role: Role;
  managerEmployeeId?: string | null;
  assignedAt?: Date;
};

/**
 * Repository for `employees` + `employee_assignments` (Story 6-2a,
 * Arch §6.2, PRD §4.2 / §6.1).
 *
 * AC4: this is the ONLY surface that reads or writes the identity
 * tables. Epic 7/8/9/10/13 services inject this repo rather than
 * touching PrismaService directly — the modular-monolith boundary
 * makes the identity domain re-implementable without cross-module
 * impact (e.g. when SCIM sync lands and changes how employees come
 * into being).
 *
 * Two surfaces in one repository because the two tables are tightly
 * coupled: every `employees` operation that creates a new row often
 * needs a paired `employee_assignments` row, and the manager-hierarchy
 * graph queries always JOIN through both. Keeping them in one
 * repository avoids the cross-call pattern that forces two
 * `withOrgScope` transactions where one would suffice.
 *
 * The self-management trigger (AC3) surfaces from the DB as a
 * `check_violation` SQLSTATE 23514 — Prisma maps this to a
 * `PrismaClientKnownRequestError` with code `P2010` (raw query
 * failed). The repo lets it propagate; Epic 7's CRUD service is
 * responsible for translating to a structured 400.
 */
@Injectable()
export class EmployeesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ── employees ────────────────────────────────────────────────────

  async listActive(organizationId: string): Promise<EmployeeRow[]> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employee.findMany({
        where: { deactivatedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async findById(organizationId: string, id: string): Promise<EmployeeRow | null> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employee.findUnique({ where: { id } }),
    );
  }

  async findByUserId(organizationId: string, userId: string): Promise<EmployeeRow | null> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employee.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      }),
    );
  }

  async create(organizationId: string, input: CreateEmployeeInput): Promise<EmployeeRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employee.create({
        data: {
          organizationId,
          userId: input.userId,
          careerTrackId: input.careerTrackId ?? null,
          levelId: input.levelId ?? null,
          assignedAt: input.assignedAt ?? null,
        },
      }),
    );
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employee.update({
        where: { id },
        data: {
          ...(input.careerTrackId !== undefined ? { careerTrackId: input.careerTrackId } : {}),
          ...(input.levelId !== undefined ? { levelId: input.levelId } : {}),
          ...(input.assignedAt !== undefined ? { assignedAt: input.assignedAt } : {}),
          ...(input.deactivatedAt !== undefined ? { deactivatedAt: input.deactivatedAt } : {}),
        },
      }),
    );
  }

  // ── employee_assignments ─────────────────────────────────────────

  async listAssignmentsForEmployee(
    organizationId: string,
    employeeId: string,
  ): Promise<AssignmentRow[]> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employeeAssignment.findMany({
        where: { employeeId },
        orderBy: { assignedAt: 'asc' },
      }),
    );
  }

  async listDirectReports(organizationId: string, managerEmployeeId: string): Promise<AssignmentRow[]> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employeeAssignment.findMany({
        where: { managerEmployeeId, deactivatedAt: null },
        orderBy: { assignedAt: 'asc' },
      }),
    );
  }

  async createAssignment(
    organizationId: string,
    input: CreateAssignmentInput,
  ): Promise<AssignmentRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employeeAssignment.create({
        data: {
          organizationId,
          employeeId: input.employeeId,
          role: input.role,
          managerEmployeeId: input.managerEmployeeId ?? null,
          assignedAt: input.assignedAt ?? new Date(),
        },
      }),
    );
  }

  /** Soft-deactivate an assignment (sets `deactivated_at = NOW()`).
   *  The PARTIAL unique index excludes deactivated rows so a fresh
   *  active grant for the same (employee, org, role) is then permitted. */
  async deactivateAssignment(organizationId: string, id: string): Promise<AssignmentRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.employeeAssignment.update({
        where: { id },
        data: { deactivatedAt: new Date() },
      }),
    );
  }
}
