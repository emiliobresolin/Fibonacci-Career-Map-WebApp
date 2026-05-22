import { Inject, Injectable } from '@nestjs/common';
import { EvidenceType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';

export type CreateRequirementInput = {
  layerId: string;
  name: string;
  description?: string | null;
  evidenceType: EvidenceType;
  weight: number;
  mandatory?: boolean;
  expiryMonths?: number | null;
  active?: boolean;
};

export type UpdateRequirementInput = {
  name?: string;
  description?: string | null;
  evidenceType?: EvidenceType;
  weight?: number;
  mandatory?: boolean;
  expiryMonths?: number | null;
  active?: boolean;
};

export type RequirementRow = {
  id: string;
  organizationId: string;
  layerId: string;
  name: string;
  description: string | null;
  evidenceType: EvidenceType;
  weight: number;
  mandatory: boolean;
  expiryMonths: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Repository for `requirements` (Story 6-2, Arch §6.2, PRD §8.4).
 *
 * Requirements live under layers (and therefore under levels and
 * tracks). `weight` is a positive integer enforced by a DB CHECK;
 * `expiry_months` is nullable but POSITIVE when set (also enforced
 * at the DB layer). The Epic-8 evidence flow reads `evidenceType`
 * to pick the right upload / submission surface.
 *
 * Deactivation is preferred over deletion: `active = false` removes
 * the requirement from new evidence-collection surfaces but
 * preserves the FK target for historical evidence rows.
 */
@Injectable()
export class RequirementsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listByLayer(organizationId: string, layerId: string): Promise<RequirementRow[]> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.requirement.findMany({
        where: { layerId },
        orderBy: [{ active: 'desc' }, { weight: 'desc' }, { name: 'asc' }],
      }),
    );
  }

  async findById(organizationId: string, id: string): Promise<RequirementRow | null> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.requirement.findUnique({ where: { id } }),
    );
  }

  async create(organizationId: string, input: CreateRequirementInput): Promise<RequirementRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.requirement.create({
        data: {
          organizationId,
          layerId: input.layerId,
          name: input.name,
          description: input.description ?? null,
          evidenceType: input.evidenceType,
          weight: input.weight,
          mandatory: input.mandatory ?? false,
          expiryMonths: input.expiryMonths ?? null,
          active: input.active ?? true,
        },
      }),
    );
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateRequirementInput,
  ): Promise<RequirementRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.requirement.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.evidenceType !== undefined ? { evidenceType: input.evidenceType } : {}),
          ...(input.weight !== undefined ? { weight: input.weight } : {}),
          ...(input.mandatory !== undefined ? { mandatory: input.mandatory } : {}),
          ...(input.expiryMonths !== undefined ? { expiryMonths: input.expiryMonths } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      }),
    );
  }
}
