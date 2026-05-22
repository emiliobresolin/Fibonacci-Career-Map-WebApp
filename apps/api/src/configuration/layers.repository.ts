import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';

export type CreateLayerInput = {
  levelId: string;
  name: string;
  displayOrder?: number;
};

export type UpdateLayerInput = {
  name?: string;
  displayOrder?: number;
};

export type LayerRow = {
  id: string;
  organizationId: string;
  levelId: string;
  name: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Repository for `layers` (Story 6-2, Arch §6.2, PRD §8.3).
 *
 * Layers are per-level. The default CDF seed produces Capability /
 * Delivery / Influence (Story 6-3 will own the seed-default policy);
 * the repository is name-agnostic and accepts any non-empty operator
 * input. Unique on (level_id, name).
 */
@Injectable()
export class LayersRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listByLevel(organizationId: string, levelId: string): Promise<LayerRow[]> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.layer.findMany({
        where: { levelId },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async findById(organizationId: string, id: string): Promise<LayerRow | null> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.layer.findUnique({ where: { id } }),
    );
  }

  async create(organizationId: string, input: CreateLayerInput): Promise<LayerRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.layer.create({
        data: {
          organizationId,
          levelId: input.levelId,
          name: input.name,
          displayOrder: input.displayOrder ?? 0,
        },
      }),
    );
  }

  async update(organizationId: string, id: string, input: UpdateLayerInput): Promise<LayerRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.layer.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        },
      }),
    );
  }
}
