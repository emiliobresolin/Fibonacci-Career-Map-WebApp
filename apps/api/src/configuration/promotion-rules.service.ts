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
import { emitConfigurationChanged } from './audit.js';
import { LevelsRepository } from './levels.repository.js';
import {
  PromotionRulesRepository,
  type PromotionRuleRow,
} from './promotion-rules.repository.js';

export type CreatePromotionRuleInput = {
  minScore: number;
  minTimeAtLevelMonths?: number | null;
  mandatoryCompletion?: boolean;
  managerRequired?: boolean;
  hrRequired?: boolean;
  blockerCheck?: boolean;
};

export type UpdatePromotionRuleInput = Partial<CreatePromotionRuleInput>;

const MIN_SCORE_MAX = 1_000_000;
const MIN_TIME_MONTHS_MAX = 600;

/**
 * PromotionRulesService (Story 7-5, PRD FR-6.5 §8.5, Arch §6.2).
 *
 * One rule per level (enforced by the unique constraint on `level_id`).
 * The eligibility evaluator (Epic 9 §7.5) reads this row to gate
 * Promotion Eligibility; the five fields are the five gates:
 *   • minScore — Score Progress threshold
 *   • mandatoryCompletion — all mandatory requirements approved
 *   • minTimeAtLevelMonths — null = no tenure floor
 *   • managerRequired / hrRequired — approval-chain composition
 *   • blockerCheck — consult `employee_blockers` for OPEN rows
 *
 * No DELETE endpoint: a level cannot exist without its rule (the
 * evaluator would have nothing to gate on). To "remove" a rule, an
 * admin deactivates the parent level (Story 7-2). Creating a second
 * rule for the same level surfaces as 409 (P2002 on `level_id`).
 */
@Injectable()
export class PromotionRulesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PromotionRulesRepository) private readonly repo: PromotionRulesRepository,
    @Inject(LevelsRepository) private readonly levelsRepo: LevelsRepository,
  ) {}

  async findByLevelId(organizationId: string, levelId: string): Promise<PromotionRuleRow> {
    await this.assertLevelExists(organizationId, levelId);
    const rule = await this.repo.findByLevelId(organizationId, levelId);
    if (!rule) {
      throw new NotFoundException({
        error: 'not_found',
        message: 'No promotion rule configured for this level',
      });
    }
    return rule;
  }

  async create(
    organizationId: string,
    levelId: string,
    input: CreatePromotionRuleInput,
    actor: ActorContext,
  ): Promise<PromotionRuleRow> {
    await this.assertLevelExists(organizationId, levelId);

    const minScore = validateMinScore(input?.minScore);
    const minTimeAtLevelMonths = validateMinTimeMonths(input?.minTimeAtLevelMonths);
    const mandatoryCompletion = input?.mandatoryCompletion === undefined
      ? true
      : validateBool(input.mandatoryCompletion, 'mandatoryCompletion');
    const managerRequired = input?.managerRequired === undefined
      ? true
      : validateBool(input.managerRequired, 'managerRequired');
    const hrRequired = input?.hrRequired === undefined
      ? false
      : validateBool(input.hrRequired, 'hrRequired');
    const blockerCheck = input?.blockerCheck === undefined
      ? true
      : validateBool(input.blockerCheck, 'blockerCheck');

    try {
      return await withOrgScope(this.prisma, organizationId, async (tx) => {
        const row = await tx.promotionRule.create({
          data: {
            organizationId,
            levelId,
            minScore,
            minTimeAtLevelMonths,
            mandatoryCompletion,
            managerRequired,
            hrRequired,
            blockerCheck,
          },
        });
        await emitConfigurationChanged(tx, organizationId, actor, {
          configEntityType: 'promotion_rule',
          entityId: row.id,
          before: null,
          after: row,
          serialize: serializePromotionRuleRow,
        });
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          error: 'conflict',
          message: 'A promotion rule already exists for this level (one per level allowed)',
        });
      }
      throw err;
    }
  }

  async updateByLevelId(
    organizationId: string,
    levelId: string,
    input: UpdatePromotionRuleInput,
    actor: ActorContext,
  ): Promise<PromotionRuleRow> {
    const patch: Prisma.PromotionRuleUpdateInput = {};
    if (input?.minScore !== undefined) patch.minScore = validateMinScore(input.minScore);
    if (input?.minTimeAtLevelMonths !== undefined) {
      patch.minTimeAtLevelMonths = validateMinTimeMonths(input.minTimeAtLevelMonths);
    }
    if (input?.mandatoryCompletion !== undefined) {
      patch.mandatoryCompletion = validateBool(input.mandatoryCompletion, 'mandatoryCompletion');
    }
    if (input?.managerRequired !== undefined) {
      patch.managerRequired = validateBool(input.managerRequired, 'managerRequired');
    }
    if (input?.hrRequired !== undefined) {
      patch.hrRequired = validateBool(input.hrRequired, 'hrRequired');
    }
    if (input?.blockerCheck !== undefined) {
      patch.blockerCheck = validateBool(input.blockerCheck, 'blockerCheck');
    }
    if (Object.keys(patch).length === 0) {
      return this.findByLevelId(organizationId, levelId);
    }

    try {
      return await withOrgScope(this.prisma, organizationId, async (tx) => {
        const before = await tx.promotionRule.findUnique({ where: { levelId } });
        if (!before) {
          throw new NotFoundException({
            error: 'not_found',
            message: 'No promotion rule configured for this level',
          });
        }
        const after = await tx.promotionRule.update({ where: { id: before.id }, data: patch });
        await emitConfigurationChanged(tx, organizationId, actor, {
          configEntityType: 'promotion_rule',
          entityId: after.id,
          before,
          after,
          serialize: serializePromotionRuleRow,
        });
        return after;
      });
    } catch (err) {
      // Narrow concurrency window: between the findUnique and update,
      // another tx may delete + recreate the rule (e.g. an admin
      // recreating after a wipe). Prisma surfaces this as P2025 — we
      // translate to 409 with a hint that the caller should re-fetch
      // and retry rather than treat the missing-record as a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new ConflictException({
          error: 'conflict',
          message: 'Promotion rule changed during update; re-fetch and retry',
        });
      }
      throw err;
    }
  }

  private async assertLevelExists(organizationId: string, levelId: string): Promise<void> {
    const level = await this.levelsRepo.findById(organizationId, levelId);
    if (!level) {
      throw new NotFoundException({ error: 'not_found', message: 'Unknown level' });
    }
  }
}

// ─── Validation helpers ────────────────────────────────────────────

function validateMinScore(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > MIN_SCORE_MAX) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `minScore must be a non-negative integer ≤${MIN_SCORE_MAX}`,
    });
  }
  return raw;
}

function validateMinTimeMonths(raw: unknown): number | null {
  // DB CHECK `promotion_rules_min_time_nonneg` allows IS NULL OR >= 0;
  // the service mirrors that exactly (a caller expressing "no tenure
  // floor" as 0 rather than null is legitimate).
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > MIN_TIME_MONTHS_MAX) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `minTimeAtLevelMonths must be null or a non-negative integer ≤${MIN_TIME_MONTHS_MAX}`,
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

function serializePromotionRuleRow(row: PromotionRuleRow): Record<string, unknown> {
  return {
    id: row.id,
    organizationId: row.organizationId,
    levelId: row.levelId,
    minScore: row.minScore,
    minTimeAtLevelMonths: row.minTimeAtLevelMonths,
    mandatoryCompletion: row.mandatoryCompletion,
    managerRequired: row.managerRequired,
    hrRequired: row.hrRequired,
    blockerCheck: row.blockerCheck,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
