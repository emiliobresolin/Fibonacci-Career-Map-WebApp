import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';

/** Input for creating a career track. `slug` is the per-org unique
 *  identifier; `name` is the human-facing label. `displayOrder`
 *  defaults to 0 — operators reorder via update. */
export type CreateCareerTrackInput = {
  slug: string;
  name: string;
  description?: string | null;
  displayOrder?: number;
  active?: boolean;
};

export type UpdateCareerTrackInput = Partial<CreateCareerTrackInput>;

export type CareerTrackRow = {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string | null;
  displayOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Repository for `career_tracks` (Story 6-2, Arch §6.2, PRD §8.1).
 *
 * Every method takes an explicit `organizationId` and wraps queries
 * in `withOrgScope` so RLS gates them at the DB layer. AC3: this is
 * the only module surface that touches `career_tracks` — downstream
 * services (configuration CRUD in Epic 7, scoring lookups in Epic 9,
 * map projection in Epic 10) go through this repository.
 *
 * The repository deliberately keeps a narrow API: list / findById /
 * findBySlug / create / update / deactivate. Cross-cutting CRUD
 * concerns (audit emission, configuration.changed outbox) land in
 * the Epic 7 service layer that wraps this; the repository is a
 * pure data-access boundary.
 */
@Injectable()
export class CareerTracksRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<CareerTrackRow[]> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.careerTrack.findMany({
        where: { organizationId },
        orderBy: [{ displayOrder: 'asc' }, { slug: 'asc' }],
      }),
    );
  }

  async findById(organizationId: string, id: string): Promise<CareerTrackRow | null> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.careerTrack.findUnique({ where: { id } }),
    );
  }

  async findBySlug(organizationId: string, slug: string): Promise<CareerTrackRow | null> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.careerTrack.findUnique({
        where: { organizationId_slug: { organizationId, slug } },
      }),
    );
  }

  async create(organizationId: string, input: CreateCareerTrackInput): Promise<CareerTrackRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.careerTrack.create({
        data: {
          organizationId,
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          displayOrder: input.displayOrder ?? 0,
          active: input.active ?? true,
        },
      }),
    );
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateCareerTrackInput,
  ): Promise<CareerTrackRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.careerTrack.update({
        where: { id },
        data: {
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      }),
    );
  }
}
