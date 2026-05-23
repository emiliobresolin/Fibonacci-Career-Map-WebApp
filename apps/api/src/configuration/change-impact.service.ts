import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';

type PrismaTxClient = Prisma.TransactionClient;

export type ChangeImpactEntityType =
  | 'career_track'
  | 'level'
  | 'layer'
  | 'requirement'
  | 'promotion_rule';

export type ChangeImpactInput = {
  entityType: ChangeImpactEntityType | string;
  entityId: string;
};

export type ChangeImpactResult = {
  /** Affected employee count, with the cap convention: when count
   *  exceeds `SAMPLE_CAP`, `sample_employee_ids` is truncated but
   *  `affected_employee_count` is the true total. */
  affected_employee_count: number;
  /** Up to 20 deterministic sample ids (sorted) for the admin UI to
   *  preview without enumerating thousands of rows. */
  sample_employee_ids: string[];
};

const VALID_ENTITY_TYPES: ReadonlyArray<ChangeImpactEntityType> = [
  'career_track',
  'level',
  'layer',
  'requirement',
  'promotion_rule',
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAMPLE_CAP = 20;

/**
 * ChangeImpactService (Story 7-8, PRD FR-6.8).
 *
 * Deterministic, read-only estimate of how many employees a proposed
 * configuration change would touch. Used by the Admin Settings UI
 * (Story 7-11) to show a "this will affect N employees" confirmation
 * before the admin commits a destructive change (deactivating a track,
 * shifting a level band, deleting a layer, etc).
 *
 * Resolution by entity type:
 *   • career_track       — employees with FK career_track_id = $1
 *   • level              — employees with FK level_id = $1
 *   • layer              — employees on the layer's parent level
 *   • requirement        — employees on the requirement's layer's parent level
 *   • promotion_rule     — employees on the rule's level
 *
 * All queries run inside `withOrgScope` so the RLS GUC filters to the
 * actor's org. Employees with `level_id IS NULL` (newly imported, not
 * yet assigned) never appear in any impact set — they have no
 * configuration to be affected by.
 *
 * The endpoint is intentionally read-only — AC2. No mutations, no
 * outbox emits, no side effects of any kind.
 */
@Injectable()
export class ChangeImpactService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async previewImpact(organizationId: string, input: ChangeImpactInput): Promise<ChangeImpactResult> {
    const entityType = validateEntityType(input?.entityType);
    const entityId = validateUuid(input?.entityId, 'entityId');

    return withOrgScope(this.prisma, organizationId, async (tx) => this.runImpactQuery(tx, entityType, entityId));
  }

  private async runImpactQuery(
    tx: PrismaTxClient,
    entityType: ChangeImpactEntityType,
    entityId: string,
  ): Promise<ChangeImpactResult> {
      // Resolve the affected level set first (a single levelId or a
      // null-for-all-track-levels), then fan into employees. Splitting
      // resolution out makes the per-kind logic legible and lets every
      // path share the same employee count + sample query.
      const levelIds = await this.resolveAffectedLevelIds(tx, entityType, entityId);

      // Reviewer BLOCKER: every count + sample query filters
      // `deactivated_at IS NULL` so ex-employees pinned to the track/level
      // don't inflate the admin's "this will affect N employees"
      // confirmation. The canonical employee reader
      // (apps/api/src/identity/employees.repository.ts) does the same.
      if (levelIds === 'TRACK') {
        // Whole-track impact: any active employee with this track,
        // even those not yet assigned a level (they're still on the
        // track and would be re-mapped if the track were deactivated).
        const countRows = await tx.$queryRaw<{ total: bigint }[]>`
          SELECT COUNT(*)::bigint AS total
            FROM employees
           WHERE career_track_id = ${entityId}::uuid
             AND deactivated_at IS NULL
        `;
        const samples = await tx.$queryRaw<{ id: string }[]>`
          SELECT id
            FROM employees
           WHERE career_track_id = ${entityId}::uuid
             AND deactivated_at IS NULL
           ORDER BY id
           LIMIT ${SAMPLE_CAP}
        `;
        return {
          affected_employee_count: extractCount(countRows),
          sample_employee_ids: samples.map((r) => r.id),
        };
      }

      // Level-set impact. Cardinality is small in practice (a single
      // level for level/layer/requirement/promotion_rule changes) so
      // an IN-list query is fine.
      if (levelIds.length === 0) {
        return { affected_employee_count: 0, sample_employee_ids: [] };
      }
      const countRows = await tx.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*)::bigint AS total
          FROM employees
         WHERE level_id = ANY(${levelIds}::uuid[])
           AND deactivated_at IS NULL
      `;
      const samples = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
          FROM employees
         WHERE level_id = ANY(${levelIds}::uuid[])
           AND deactivated_at IS NULL
         ORDER BY id
         LIMIT ${SAMPLE_CAP}
      `;
      return {
        affected_employee_count: extractCount(countRows),
        sample_employee_ids: samples.map((r) => r.id),
      };
  }

  /** Returns the set of `level_id`s whose employees the change touches,
   *  or the sentinel `'TRACK'` for whole-track impact (the caller then
   *  filters employees by `career_track_id` instead of `level_id`). */
  private async resolveAffectedLevelIds(
    tx: PrismaTxClient,
    entityType: ChangeImpactEntityType,
    entityId: string,
  ): Promise<string[] | 'TRACK'> {
    switch (entityType) {
      case 'career_track': {
        const track = await tx.careerTrack.findUnique({ where: { id: entityId } });
        if (!track) throw new NotFoundException({ error: 'not_found', message: 'Unknown career_track' });
        return 'TRACK';
      }
      case 'level': {
        const level = await tx.level.findUnique({ where: { id: entityId } });
        if (!level) throw new NotFoundException({ error: 'not_found', message: 'Unknown level' });
        return [level.id];
      }
      case 'layer': {
        const layer = await tx.layer.findUnique({ where: { id: entityId } });
        if (!layer) throw new NotFoundException({ error: 'not_found', message: 'Unknown layer' });
        return [layer.levelId];
      }
      case 'requirement': {
        const req = await tx.requirement.findUnique({
          where: { id: entityId },
          select: { layer: { select: { levelId: true } } },
        });
        if (!req) throw new NotFoundException({ error: 'not_found', message: 'Unknown requirement' });
        return [req.layer.levelId];
      }
      case 'promotion_rule': {
        const rule = await tx.promotionRule.findUnique({ where: { id: entityId } });
        if (!rule) throw new NotFoundException({ error: 'not_found', message: 'Unknown promotion_rule' });
        return [rule.levelId];
      }
    }
  }
}

function validateEntityType(raw: unknown): ChangeImpactEntityType {
  if (typeof raw !== 'string' || !VALID_ENTITY_TYPES.includes(raw as ChangeImpactEntityType)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `entityType must be one of ${VALID_ENTITY_TYPES.join(', ')}`,
    });
  }
  return raw as ChangeImpactEntityType;
}

function validateUuid(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${field} must be a UUID`,
    });
  }
  return raw;
}

/** Pull the bigint COUNT(*) off the single-row result safely.
 *  `noUncheckedIndexedAccess` makes destructuring `[{ total }]` reject
 *  because TS can't prove the array isn't empty. `SELECT COUNT(*)`
 *  ALWAYS returns exactly one row — if we see an empty array, the
 *  driver swallowed an error. Throw rather than return 0: silently
 *  rendering "affects 0" is exactly how an admin deletes a track they
 *  thought was empty (reviewer M5).
 *
 *  Bigint → number coercion guard (reviewer M6): for COUNT(*) larger
 *  than 2^53 - 1 we'd silently lose precision. Org scale is bounded
 *  by Org of 100k employees, so MAX_SAFE_INTEGER is plenty — but cap
 *  defensively and throw rather than mislead the UI. */
function extractCount(rows: { total: bigint }[]): number {
  const head = rows[0];
  if (!head) {
    throw new Error('change_impact.extractCount: COUNT(*) returned no rows — driver error');
  }
  if (head.total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `change_impact.extractCount: COUNT(*) ${head.total} exceeds Number.MAX_SAFE_INTEGER`,
    );
  }
  return Number(head.total);
}
