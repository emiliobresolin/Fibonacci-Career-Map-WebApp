import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';

export type CreateLevelInput = {
  careerTrackId: string;
  levelCode: string;
  name: string;
  scoreBandStart: number;
  scoreBandEnd: number;
  displayOrder?: number;
  active?: boolean;
};

export type UpdateLevelInput = {
  levelCode?: string;
  name?: string;
  scoreBandStart?: number;
  scoreBandEnd?: number;
  displayOrder?: number;
  active?: boolean;
};

export type LevelRow = {
  id: string;
  organizationId: string;
  careerTrackId: string;
  levelCode: string;
  name: string;
  scoreBandStart: number;
  scoreBandEnd: number;
  displayOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Repository for `levels` (Story 6-2, Arch §6.2, PRD §8.2).
 *
 * The non-overlap invariant on score bands within a (track, active=true)
 * scope is enforced by a GiST EXCLUDE constraint in the migration. The
 * repository surfaces the DB error as-is — the Epic 7 CRUD service is
 * responsible for translating constraint violations into a structured
 * 409 with the conflicting band coordinates.
 *
 * `listByTrack` returns levels in display order so the configuration
 * UI and the map-projection module (Epic 10) can read a stable
 * sequence without sorting client-side.
 */
@Injectable()
export class LevelsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listByTrack(organizationId: string, careerTrackId: string): Promise<LevelRow[]> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.level.findMany({
        where: { careerTrackId },
        orderBy: [{ displayOrder: 'asc' }, { scoreBandStart: 'asc' }],
      }),
    );
  }

  async findById(organizationId: string, id: string): Promise<LevelRow | null> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.level.findUnique({ where: { id } }),
    );
  }

  async create(organizationId: string, input: CreateLevelInput): Promise<LevelRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.level.create({
        data: {
          organizationId,
          careerTrackId: input.careerTrackId,
          levelCode: input.levelCode,
          name: input.name,
          scoreBandStart: input.scoreBandStart,
          scoreBandEnd: input.scoreBandEnd,
          displayOrder: input.displayOrder ?? 0,
          active: input.active ?? true,
        },
      }),
    );
  }

  async update(organizationId: string, id: string, input: UpdateLevelInput): Promise<LevelRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.level.update({
        where: { id },
        data: {
          ...(input.levelCode !== undefined ? { levelCode: input.levelCode } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.scoreBandStart !== undefined ? { scoreBandStart: input.scoreBandStart } : {}),
          ...(input.scoreBandEnd !== undefined ? { scoreBandEnd: input.scoreBandEnd } : {}),
          ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      }),
    );
  }
}
