import type { Prisma } from '@prisma/client';

import type { ConfigEntityType } from './audit.js';

/** ConfigEntityType subset that has employees attached to it.
 *  `visibility_rule`, `approval_workflow`, `rollout_mode` are org-level
 *  and don't drive bulk per-employee recalc — they're excluded. */
export type EmployeeAffectingEntityType =
  | 'career_track'
  | 'level'
  | 'layer'
  | 'requirement'
  | 'promotion_rule';

/**
 * Story 7-9: resolve the full (uncapped) list of active employee UUIDs
 * a configuration mutation touches. Lives outside ChangeImpactService
 * so the configuration services can call it inside their existing
 * `withOrgScope` tx without picking up an extra Nest DI dependency
 * (which would force every existing test fixture to be updated).
 *
 * Returns deterministic ascending-by-id order so chunking the list
 * across multiple outbox rows is stable across retries.
 *
 * Active-only: `deactivated_at IS NULL`. Same convention as the
 * canonical employees-repository reader.
 *
 * Returns `[]` if:
 *   • the entity has no employees attached yet (fresh CREATE)
 *   • the layer/requirement/promotion-rule's parent level has no
 *     employees assigned yet
 *   • the entity was just deleted (depending on call order: pass
 *     the `before` row's foreign keys for DELETE so the resolver
 *     sees the pre-delete world).
 */
export async function resolveAffectedEmployeeIds(
  tx: Prisma.TransactionClient,
  entityType: EmployeeAffectingEntityType | ConfigEntityType,
  entityId: string,
): Promise<string[]> {
  // Only the five tree-shaped types affect employees; the org-level
  // types are no-ops for the bulk-recalc consumer.
  switch (entityType) {
    case 'career_track': {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
          FROM employees
         WHERE career_track_id = ${entityId}::uuid
           AND deactivated_at IS NULL
         ORDER BY id
      `;
      return rows.map((r) => r.id);
    }
    case 'level': {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
          FROM employees
         WHERE level_id = ${entityId}::uuid
           AND deactivated_at IS NULL
         ORDER BY id
      `;
      return rows.map((r) => r.id);
    }
    case 'layer': {
      // Resolve via parent level. A layer change touches every active
      // employee on its parent level.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT e.id
          FROM employees e
          JOIN layers l ON l.level_id = e.level_id
         WHERE l.id = ${entityId}::uuid
           AND e.deactivated_at IS NULL
         ORDER BY e.id
      `;
      return rows.map((r) => r.id);
    }
    case 'requirement': {
      // Resolve via layer → level.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT e.id
          FROM employees e
          JOIN layers l ON l.level_id = e.level_id
          JOIN requirements r ON r.layer_id = l.id
         WHERE r.id = ${entityId}::uuid
           AND e.deactivated_at IS NULL
         ORDER BY e.id
      `;
      return rows.map((r) => r.id);
    }
    case 'promotion_rule': {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT e.id
          FROM employees e
          JOIN promotion_rules p ON p.level_id = e.level_id
         WHERE p.id = ${entityId}::uuid
           AND e.deactivated_at IS NULL
         ORDER BY e.id
      `;
      return rows.map((r) => r.id);
    }
    default:
      // visibility_rule, approval_workflow, rollout_mode — org-level
      // settings don't drive bulk recalc per the Epic-9 design. Return
      // empty so callers can pass any ConfigEntityType uniformly.
      return [];
  }
}
