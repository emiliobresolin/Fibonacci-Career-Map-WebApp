import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';

export type CreatePromotionRuleInput = {
  levelId: string;
  minScore: number;
  minTimeAtLevelMonths?: number | null;
  mandatoryCompletion?: boolean;
  managerRequired?: boolean;
  hrRequired?: boolean;
  blockerCheck?: boolean;
};

export type UpdatePromotionRuleInput = Partial<Omit<CreatePromotionRuleInput, 'levelId'>>;

export type PromotionRuleRow = {
  id: string;
  organizationId: string;
  levelId: string;
  minScore: number;
  minTimeAtLevelMonths: number | null;
  mandatoryCompletion: boolean;
  managerRequired: boolean;
  hrRequired: boolean;
  blockerCheck: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Repository for `promotion_rules` (Story 6-2, Arch §6.2, PRD §8.5).
 *
 * Exactly one rule per level (enforced by the unique constraint on
 * `level_id`). The eligibility evaluator (Epic 9 §7.5) reads this
 * row to gate Promotion Eligibility — minScore, mandatoryCompletion,
 * minTimeAtLevelMonths, managerRequired/hrRequired, and blockerCheck
 * are the five gates.
 *
 * Defaults at the schema layer mirror PRD §8.5: mandatoryCompletion
 * = true, managerRequired = true, hrRequired = false, blockerCheck =
 * true. `minScore` and `minTimeAtLevelMonths` are operator-supplied
 * and have no schema default.
 */
@Injectable()
export class PromotionRulesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByLevelId(organizationId: string, levelId: string): Promise<PromotionRuleRow | null> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.promotionRule.findUnique({ where: { levelId } }),
    );
  }

  async findById(organizationId: string, id: string): Promise<PromotionRuleRow | null> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.promotionRule.findUnique({ where: { id } }),
    );
  }

  async create(organizationId: string, input: CreatePromotionRuleInput): Promise<PromotionRuleRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.promotionRule.create({
        data: {
          organizationId,
          levelId: input.levelId,
          minScore: input.minScore,
          minTimeAtLevelMonths: input.minTimeAtLevelMonths ?? null,
          mandatoryCompletion: input.mandatoryCompletion ?? true,
          managerRequired: input.managerRequired ?? true,
          hrRequired: input.hrRequired ?? false,
          blockerCheck: input.blockerCheck ?? true,
        },
      }),
    );
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdatePromotionRuleInput,
  ): Promise<PromotionRuleRow> {
    return withOrgScope(this.prisma, organizationId, (tx) =>
      tx.promotionRule.update({
        where: { id },
        data: {
          ...(input.minScore !== undefined ? { minScore: input.minScore } : {}),
          ...(input.minTimeAtLevelMonths !== undefined
            ? { minTimeAtLevelMonths: input.minTimeAtLevelMonths }
            : {}),
          ...(input.mandatoryCompletion !== undefined
            ? { mandatoryCompletion: input.mandatoryCompletion }
            : {}),
          ...(input.managerRequired !== undefined
            ? { managerRequired: input.managerRequired }
            : {}),
          ...(input.hrRequired !== undefined ? { hrRequired: input.hrRequired } : {}),
          ...(input.blockerCheck !== undefined ? { blockerCheck: input.blockerCheck } : {}),
        },
      }),
    );
  }
}
