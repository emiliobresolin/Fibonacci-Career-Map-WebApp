import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EvidenceType, Prisma } from '@prisma/client';

import type { ActorContext } from '../auth/actor-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import { emitConfigurationChanged } from './audit.js';
import { LayersRepository } from './layers.repository.js';
import { RequirementsRepository, type RequirementRow } from './requirements.repository.js';

export type CreateRequirementInput = {
  name: string;
  description?: string | null;
  evidenceType: EvidenceType | string;
  weight: number;
  mandatory?: boolean;
  expiryMonths?: number | null;
};

export type UpdateRequirementInput = {
  name?: string;
  description?: string | null;
  evidenceType?: EvidenceType | string;
  weight?: number;
  mandatory?: boolean;
  expiryMonths?: number | null;
};

const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
const WEIGHT_MAX = 1_000;
const EXPIRY_MONTHS_MAX = 600;
// Derived from the Prisma-generated enum at runtime so adding a fifth
// variant to schema.prisma (e.g. SIGNATURE) does NOT silently get
// rejected here. Source of truth = the schema, not this file.
const VALID_EVIDENCE_TYPES: ReadonlyArray<EvidenceType> =
  Object.values(EvidenceType) as ReadonlyArray<EvidenceType>;

/**
 * RequirementsService (Story 7-4, PRD FR-6.4 §8.4, Arch §6.2).
 *
 * AC4: requirements are soft-deactivated, never hard-deleted. The
 * `active` column gates inclusion in evidence-collection surfaces.
 * Once Epic 8 lands and `evidence.requirement_id` rows exist, hard
 * delete is structurally prevented (no DELETE method on this service);
 * pre-Epic-8 the soft-delete is still mandatory by AC.
 *
 * `evidenceType` is validated against the Prisma `EvidenceType` enum
 * before the write so an unknown value surfaces as 400 rather than a
 * generic Prisma enum error. `weight` is a positive integer (DB CHECK
 * `requirements_weight_positive` is the source of truth);
 * `expiryMonths` is nullable and positive when set (DB CHECK
 * `requirements_expiry_months_positive`).
 *
 * Audit emission rides the shared helper from Story 7-3 (F7-2b).
 */
@Injectable()
export class RequirementsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RequirementsRepository) private readonly repo: RequirementsRepository,
    @Inject(LayersRepository) private readonly layersRepo: LayersRepository,
  ) {}

  async listByLayer(
    organizationId: string,
    layerId: string,
    opts: { includeInactive?: boolean } = {},
  ): Promise<RequirementRow[]> {
    await this.assertLayerExists(organizationId, layerId);
    const rows = await this.repo.listByLayer(organizationId, layerId);
    return opts.includeInactive ? rows : rows.filter((r) => r.active);
  }

  async findById(organizationId: string, id: string): Promise<RequirementRow> {
    const row = await this.repo.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException({ error: 'not_found', message: 'Unknown requirement' });
    }
    return row;
  }

  async create(
    organizationId: string,
    layerId: string,
    input: CreateRequirementInput,
    actor: ActorContext,
  ): Promise<RequirementRow> {
    await this.assertLayerExists(organizationId, layerId);

    const name = validateName(input?.name);
    const description = validateDescription(input?.description);
    const evidenceType = validateEvidenceType(input?.evidenceType);
    const weight = validateWeight(input?.weight);
    const mandatory = input?.mandatory === undefined ? false : validateBool(input.mandatory, 'mandatory');
    const expiryMonths = validateExpiryMonths(input?.expiryMonths);

    return withOrgScope(this.prisma, organizationId, async (tx) => {
      const row = await tx.requirement.create({
        data: {
          organizationId,
          layerId,
          name,
          description,
          evidenceType,
          weight,
          mandatory,
          expiryMonths,
          active: true,
        },
      });
      await emitConfigurationChanged(tx, organizationId, actor, {
        configEntityType: 'requirement',
        entityId: row.id,
        before: null,
        after: row,
        serialize: serializeRequirementRow,
      });
      return row;
    });
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateRequirementInput,
    actor: ActorContext,
  ): Promise<RequirementRow> {
    const patch: Prisma.RequirementUpdateInput = {};
    if (input?.name !== undefined) patch.name = validateName(input.name);
    if (input?.description !== undefined) patch.description = validateDescription(input.description);
    if (input?.evidenceType !== undefined) patch.evidenceType = validateEvidenceType(input.evidenceType);
    if (input?.weight !== undefined) patch.weight = validateWeight(input.weight);
    if (input?.mandatory !== undefined) patch.mandatory = validateBool(input.mandatory, 'mandatory');
    if (input?.expiryMonths !== undefined) patch.expiryMonths = validateExpiryMonths(input.expiryMonths);
    if (Object.keys(patch).length === 0) {
      return this.findById(organizationId, id);
    }

    return withOrgScope(this.prisma, organizationId, async (tx) => {
      const before = await tx.requirement.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException({ error: 'not_found', message: 'Unknown requirement' });
      }
      const after = await tx.requirement.update({ where: { id }, data: patch });
      await emitConfigurationChanged(tx, organizationId, actor, {
        configEntityType: 'requirement',
        entityId: after.id,
        before,
        after,
        serialize: serializeRequirementRow,
      });
      return after;
    });
  }

  /** Soft deactivate. AC4: hard delete is forbidden because evidence
   *  rows (Epic 8) reference requirements by FK and we must preserve
   *  the audit trail. Idempotent — deactivating an inactive row is a
   *  no-op (no audit emit). */
  async deactivate(
    organizationId: string,
    id: string,
    actor: ActorContext,
  ): Promise<RequirementRow> {
    return withOrgScope(this.prisma, organizationId, async (tx) => {
      const before = await tx.requirement.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException({ error: 'not_found', message: 'Unknown requirement' });
      }
      if (!before.active) {
        return before;
      }
      const after = await tx.requirement.update({
        where: { id },
        data: { active: false },
      });
      await emitConfigurationChanged(tx, organizationId, actor, {
        configEntityType: 'requirement',
        entityId: after.id,
        before,
        after,
        serialize: serializeRequirementRow,
      });
      return after;
    });
  }

  private async assertLayerExists(organizationId: string, layerId: string): Promise<void> {
    const layer = await this.layersRepo.findById(organizationId, layerId);
    if (!layer) {
      throw new NotFoundException({ error: 'not_found', message: 'Unknown layer' });
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

function validateDescription(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') {
    throw new BadRequestException({ error: 'bad_request', message: 'description must be a string' });
  }
  const trimmed = raw.trim();
  if (trimmed.length > DESCRIPTION_MAX) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `description must be ≤${DESCRIPTION_MAX} chars`,
    });
  }
  return trimmed.length > 0 ? trimmed : null;
}

function validateEvidenceType(raw: unknown): EvidenceType {
  if (typeof raw !== 'string' || !VALID_EVIDENCE_TYPES.includes(raw as EvidenceType)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `evidenceType must be one of ${VALID_EVIDENCE_TYPES.join(', ')}`,
    });
  }
  return raw as EvidenceType;
}

function validateWeight(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0 || raw > WEIGHT_MAX) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `weight must be a positive integer ≤${WEIGHT_MAX}`,
    });
  }
  return raw;
}

function validateBool(raw: unknown, field: string): boolean {
  if (typeof raw !== 'boolean') {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${field} must be a boolean`,
    });
  }
  return raw;
}

function validateExpiryMonths(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0 || raw > EXPIRY_MONTHS_MAX) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `expiryMonths must be null or a positive integer ≤${EXPIRY_MONTHS_MAX}`,
    });
  }
  return raw;
}

function serializeRequirementRow(row: RequirementRow): Record<string, unknown> {
  return {
    id: row.id,
    organizationId: row.organizationId,
    layerId: row.layerId,
    name: row.name,
    description: row.description,
    evidenceType: row.evidenceType,
    weight: row.weight,
    mandatory: row.mandatory,
    expiryMonths: row.expiryMonths,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
