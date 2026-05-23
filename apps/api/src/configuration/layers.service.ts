import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { ActorContext } from '../auth/actor-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import { resolveAffectedEmployeeIds } from './affected-employees.js';
import { emitConfigurationChanged } from './audit.js';
import { LayersRepository, type LayerRow } from './layers.repository.js';
import { LevelsRepository } from './levels.repository.js';

export type CreateLayerInput = {
  name: string;
  displayOrder?: number;
};

export type UpdateLayerInput = {
  name?: string;
  displayOrder?: number;
};

const NAME_MAX = 200;

/**
 * LayersService (Story 7-3, PRD FR-6.3, Arch §6.2).
 *
 * Hard-deletes the row when admin removes a layer — the schema has no
 * `active` flag because the seed shape (Capability / Delivery / Influence)
 * is small enough that orgs typically restructure rather than deactivate.
 *
 * AC2: every level must retain at least one layer. Naively counting
 * peers and then deleting under Postgres's default READ COMMITTED
 * isolation is racy — two concurrent deletes on a level with 2 layers
 * could both see `surviving = 1` and both succeed, emptying the level.
 *
 * Mitigation: acquire a transactional advisory lock keyed on the
 * `levelId` BEFORE counting. `pg_advisory_xact_lock` serializes
 * delete operations on the same level (the lock is released at tx
 * commit/rollback); other levels remain parallel. The 409 body
 * returns `error: 'layer_min_violation'` with the affected `level_id`.
 *
 * Cascade impact: `requirements.layer_id` is `ON DELETE CASCADE`, so a
 * layer delete vaporizes its requirements too. Once Epic 8 (evidence)
 * lands, a deactivation flag will be added here — until then the
 * cascade is intentional per Arch §6.5.
 */
@Injectable()
export class LayersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LayersRepository) private readonly repo: LayersRepository,
    @Inject(LevelsRepository) private readonly levelsRepo: LevelsRepository,
  ) {}

  async listByLevel(organizationId: string, levelId: string): Promise<LayerRow[]> {
    await this.assertLevelExists(organizationId, levelId);
    return this.repo.listByLevel(organizationId, levelId);
  }

  async findById(organizationId: string, id: string): Promise<LayerRow> {
    const row = await this.repo.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException({ error: 'not_found', message: 'Unknown layer' });
    }
    return row;
  }

  async create(
    organizationId: string,
    levelId: string,
    input: CreateLayerInput,
    actor: ActorContext,
  ): Promise<LayerRow> {
    await this.assertLevelExists(organizationId, levelId);

    const name = validateName(input?.name);
    const displayOrder = validateDisplayOrder(input?.displayOrder);

    try {
      return await withOrgScope(this.prisma, organizationId, async (tx) => {
        const row = await tx.layer.create({
          data: {
            organizationId,
            levelId,
            name,
            displayOrder,
          },
        });
        const affectedEmployeeIds = await resolveAffectedEmployeeIds(tx, 'layer', row.id);
        await emitConfigurationChanged(tx, organizationId, actor, {
          configEntityType: 'layer',
          entityId: row.id,
          before: null,
          after: row,
          serialize: serializeLayerRow,
          changeType: 'CREATE',
          affectedEmployeeIds,
        });
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          error: 'conflict',
          message: `A layer named "${name}" already exists in this level`,
        });
      }
      throw err;
    }
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateLayerInput,
    actor: ActorContext,
  ): Promise<LayerRow> {
    const patch: Prisma.LayerUpdateInput = {};
    if (input?.name !== undefined) patch.name = validateName(input.name);
    if (input?.displayOrder !== undefined) patch.displayOrder = validateDisplayOrder(input.displayOrder);
    if (Object.keys(patch).length === 0) {
      return this.findById(organizationId, id);
    }

    try {
      return await withOrgScope(this.prisma, organizationId, async (tx) => {
        const before = await tx.layer.findUnique({ where: { id } });
        if (!before) {
          throw new NotFoundException({ error: 'not_found', message: 'Unknown layer' });
        }
        const after = await tx.layer.update({ where: { id }, data: patch });
        const affectedEmployeeIds = await resolveAffectedEmployeeIds(tx, 'layer', after.id);
        await emitConfigurationChanged(tx, organizationId, actor, {
          configEntityType: 'layer',
          entityId: after.id,
          before,
          after,
          serialize: serializeLayerRow,
          changeType: 'UPDATE',
          affectedEmployeeIds,
        });
        return after;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          error: 'conflict',
          message: `A layer with that name already exists in this level`,
        });
      }
      throw err;
    }
  }

  /** Hard delete. Rejects with `409 layer_min_violation` if it would
   *  leave the level empty (AC2). A transactional advisory lock keyed
   *  on `level_id` serializes concurrent deletes on the same level so
   *  the count → delete window can't be raced (see service-level
   *  docstring for the race scenario this defeats). */
  async remove(
    organizationId: string,
    id: string,
    actor: ActorContext,
  ): Promise<void> {
    return withOrgScope(this.prisma, organizationId, async (tx) => {
      const before = await tx.layer.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException({ error: 'not_found', message: 'Unknown layer' });
      }
      // Serialize concurrent deletes on this level. The lock is bound
      // to the current transaction; Postgres releases it on commit or
      // rollback. Using hashtextextended(...,0) so the bigint argument
      // is unambiguous (the int4 overload of pg_advisory_xact_lock
      // doesn't exist).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${before.levelId}::text, 0))`;
      const surviving = await tx.layer.count({
        where: { levelId: before.levelId, id: { not: id } },
      });
      if (surviving === 0) {
        throw new ConflictException({
          error: 'layer_min_violation',
          message: 'Cannot delete the last remaining layer of a level',
          level_id: before.levelId,
        });
      }
      // Story 7-9: resolve BEFORE the delete so the JOIN to `layers`
      // still finds the row. Once the delete runs, the layer's
      // employees are FK-orphaned (cascade deletes requirements but
      // not employees — employees aren't FK'd to layers directly).
      const affectedEmployeeIds = await resolveAffectedEmployeeIds(tx, 'layer', before.id);
      await tx.layer.delete({ where: { id } });
      // Audit DELETE: `after = null` per the shared helper's contract.
      await emitConfigurationChanged(tx, organizationId, actor, {
        configEntityType: 'layer',
        entityId: before.id,
        before,
        after: null,
        serialize: serializeLayerRow,
        changeType: 'DELETE',
        affectedEmployeeIds,
      });
    });
  }

  private async assertLevelExists(organizationId: string, levelId: string): Promise<void> {
    const level = await this.levelsRepo.findById(organizationId, levelId);
    if (!level) {
      throw new NotFoundException({ error: 'not_found', message: 'Unknown level' });
    }
  }
}

// ─── Validation helpers ────────────────────────────────────────────

function validateName(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new BadRequestException({ error: 'bad_request', message: 'name is required' });
  }
  const name = raw.trim();
  if (!name || name.length > NAME_MAX) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `name is required and must be ≤${NAME_MAX} chars`,
    });
  }
  return name;
}

function validateDisplayOrder(raw: unknown): number {
  if (raw === undefined) return 0;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'displayOrder must be a non-negative integer',
    });
  }
  return raw;
}

function serializeLayerRow(row: LayerRow): Record<string, unknown> {
  return {
    id: row.id,
    organizationId: row.organizationId,
    levelId: row.levelId,
    name: row.name,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
