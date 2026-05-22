import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import {
  CDF_EXPECTED_COUNTS,
  CDF_LAYERS,
  CDF_LEVELS,
  CDF_TRACKS,
} from './cdf-defaults.js';

export type SeedResult = {
  organizationId: string;
  counts: typeof CDF_EXPECTED_COUNTS;
  /** The four CDF-mandated org-level defaults, echoed from the
   *  organization row. The seeder doesn't write these — Story 6-1's
   *  provision endpoint does, via the Prisma schema's `@default`
   *  markers. The seed result echoes them so the caller can verify
   *  the org is in the expected shape in one round-trip. */
  orgDefaults: {
    visibilityDefault: string;
    approvalWorkflowDefault: string;
    promotionMode: string;
  };
};

/**
 * SeedingService (Story 6-3, PRD §6.1, PRD §7.3, PRD §8).
 *
 * Provisions the CDF (Common Default Framework) configuration for a
 * freshly-created organization. Three tracks (Software Engineering /
 * Architecture / Management) × the PRD-specified levels per track ×
 * Capability/Delivery/Influence layers × one representative
 * requirement per layer with Fibonacci weights × one promotion rule
 * per level. See `cdf-defaults.ts` for the exact data.
 *
 * Atomicity: the entire seed lands in ONE `withOrgScope` transaction.
 * If any row fails (e.g., the org doesn't exist, or the EXCLUDE band
 * constraint trips), the whole thing rolls back — no half-seeded
 * orgs.
 *
 * Idempotency: a re-run against an already-seeded org throws
 * `AlreadySeededError` BEFORE any write. We detect "already seeded"
 * by `career_tracks` row count > 0 — the cheapest, most-stable
 * predicate (every seed run produces at least three tracks; an org
 * with zero tracks is by definition not yet seeded).
 *
 * Audit: every seeded row emits a `configuration.seeded` outbox event
 * inside the same transaction. The relay (Story 3-3) lands an
 * audit_events row per seeded entity, so operators can grep by
 * `event_type = 'configuration.seeded'` to find exactly which rows a
 * given org's seed produced. The variant lives in
 * `@fcm/domain-contracts/events/audit.ts`.
 */
@Injectable()
export class SeedingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async seedOrganization(organizationId: string): Promise<SeedResult> {
    return withOrgScope(this.prisma, organizationId, async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          visibilityDefault: true,
          approvalWorkflowDefault: true,
          promotionMode: true,
        },
      });
      if (!org) {
        throw new NotFoundException({
          error: 'not_found',
          message: `Organization ${organizationId} does not exist`,
        });
      }
      const existingTracks = await tx.careerTrack.count({ where: { organizationId } });
      if (existingTracks > 0) {
        throw new AlreadySeededError(organizationId);
      }

      // ── tracks ────────────────────────────────────────────────
      const trackBySlug = new Map<string, { id: string; name: string }>();
      for (const spec of CDF_TRACKS) {
        const track = await tx.careerTrack.create({
          data: {
            organizationId,
            slug: spec.slug,
            name: spec.name,
            description: spec.description,
            displayOrder: spec.displayOrder,
          },
        });
        trackBySlug.set(spec.slug, { id: track.id, name: track.name });
        await emitSeedAudit(tx, organizationId, track.id, 'career_track', track.name);
      }

      // ── levels ────────────────────────────────────────────────
      const levelsByTrack = new Map<string, Array<{ id: string; levelCode: string; name: string }>>();
      for (const trackSpec of CDF_TRACKS) {
        const track = trackBySlug.get(trackSpec.slug)!;
        const levelSpecs = CDF_LEVELS[trackSpec.slug] ?? [];
        const created: Array<{ id: string; levelCode: string; name: string }> = [];
        for (const lvl of levelSpecs) {
          const level = await tx.level.create({
            data: {
              organizationId,
              careerTrackId: track.id,
              levelCode: lvl.levelCode,
              name: lvl.name,
              scoreBandStart: lvl.scoreBandStart,
              scoreBandEnd: lvl.scoreBandEnd,
              displayOrder: lvl.displayOrder,
            },
          });
          created.push({ id: level.id, levelCode: level.levelCode, name: level.name });
          await emitSeedAudit(tx, organizationId, level.id, 'level', `${track.name} ${level.levelCode}`);
        }
        levelsByTrack.set(trackSpec.slug, created);
      }

      // ── layers + requirements (per level) ────────────────────
      const layersByLevel = new Map<string, Array<{ id: string; name: string }>>();
      for (const trackSpec of CDF_TRACKS) {
        const levels = levelsByTrack.get(trackSpec.slug) ?? [];
        for (const lvl of levels) {
          const layersForLevel: Array<{ id: string; name: string }> = [];
          for (const layerSpec of CDF_LAYERS) {
            const layer = await tx.layer.create({
              data: {
                organizationId,
                levelId: lvl.id,
                name: layerSpec.name,
                displayOrder: layerSpec.displayOrder,
              },
            });
            layersForLevel.push({ id: layer.id, name: layer.name });
            await emitSeedAudit(
              tx,
              organizationId,
              layer.id,
              'layer',
              `${lvl.name} • ${layer.name}`,
            );
            // One representative requirement per layer with the
            // Fibonacci weight assigned to that layer's role.
            const req = await tx.requirement.create({
              data: {
                organizationId,
                layerId: layer.id,
                name: layerSpec.requirementName,
                description: layerSpec.requirementDescription,
                evidenceType: layerSpec.requirementEvidenceType,
                weight: layerSpec.requirementWeight,
                mandatory: false,
                expiryMonths: null,
              },
            });
            await emitSeedAudit(
              tx,
              organizationId,
              req.id,
              'requirement',
              `${lvl.name} • ${layer.name} • ${req.name}`,
            );
          }
          layersByLevel.set(lvl.id, layersForLevel);
        }
      }

      // ── promotion rules (one per level) ──────────────────────
      // PRD §8.5: "Minimum score: required score to be eligible
      // (default: level band end value)." We use scoreBandEnd
      // exactly so the default produces "you can be promoted when
      // you've earned every point in your band" semantics.
      for (const trackSpec of CDF_TRACKS) {
        const levelSpecs = CDF_LEVELS[trackSpec.slug] ?? [];
        const levels = levelsByTrack.get(trackSpec.slug) ?? [];
        for (let i = 0; i < levels.length; i++) {
          const lvl = levels[i]!;
          const lvlSpec = levelSpecs[i]!;
          const rule = await tx.promotionRule.create({
            data: {
              organizationId,
              levelId: lvl.id,
              minScore: lvlSpec.scoreBandEnd,
              minTimeAtLevelMonths: null,
              mandatoryCompletion: true,
              managerRequired: true,
              hrRequired: false,
              blockerCheck: true,
            },
          });
          await emitSeedAudit(
            tx,
            organizationId,
            rule.id,
            'promotion_rule',
            `${lvl.name} promotion rule`,
          );
        }
      }

      return {
        organizationId,
        counts: CDF_EXPECTED_COUNTS,
        orgDefaults: {
          visibilityDefault: org.visibilityDefault,
          approvalWorkflowDefault: org.approvalWorkflowDefault,
          promotionMode: org.promotionMode,
        },
      };
    });
  }
}

/**
 * Emit a `configuration.seeded` outbox event INSIDE the seeding
 * transaction. The relay will validate the payload against
 * `ConfigurationSeededSchema` (in @fcm/domain-contracts) before
 * persisting to audit_events — so a drift here surfaces as a
 * DLQ landing, not silent data loss.
 */
async function emitSeedAudit(
  tx: Parameters<Parameters<typeof withOrgScope>[2]>[0],
  organizationId: string,
  entityId: string,
  kind: 'career_track' | 'level' | 'layer' | 'requirement' | 'promotion_rule',
  name: string,
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      eventId: randomUUID(),
      organizationId,
      aggregateType: 'configuration',
      aggregateId: entityId,
      eventType: 'configuration.seeded',
      payload: {
        // System-actor: seeding runs as part of the bootstrap-tooling
        // pipeline, not as a tenant user.
        actorId: null,
        reason: null,
        before: null,
        after: { kind, name },
      },
    },
  });
}

/** Raised when `seedOrganization` is called against an org that
 *  already has a seeded configuration (the cheapest detector is
 *  `career_tracks.count() > 0`). Carries the orgId so callers can
 *  surface a useful error. */
export class AlreadySeededError extends Error {
  readonly code = 'ALREADY_SEEDED' as const;
  readonly organizationId: string;

  constructor(organizationId: string) {
    super(`Organization ${organizationId} is already seeded`);
    this.name = 'AlreadySeededError';
    this.organizationId = organizationId;
    Object.setPrototypeOf(this, AlreadySeededError.prototype);
  }
}
