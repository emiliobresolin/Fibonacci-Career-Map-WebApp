import { randomUUID } from 'node:crypto';

import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';

/** Result shape returned to the bootstrap-tooling caller. Matches PRD §14.2
 *  fields exactly — every default the AC requires is in the output so the
 *  caller can verify without a follow-up read. */
export type ProvisionedOrganization = {
  id: string;
  slug: string;
  name: string;
  visibilityDefault: 'OWN_ONLY' | 'TEAM' | 'ORG_SUMMARY' | 'ORG_FULL';
  approvalWorkflowDefault: 'SINGLE' | 'DUAL_MANAGER' | 'HR_GATE';
  promotionMode: 'CALIBRATION' | 'ACTIVE';
  createdAt: string;
};

export type ProvisionInput = {
  slug: string;
  name: string;
};

/** Slug shape — lowercase letters, digits, hyphen, no leading/trailing
 *  hyphen, 2–63 chars. Same shape DNS labels use; keeps the slug usable
 *  in URLs, log lines, and the OIDC state map. Enforces the 2-char
 *  minimum via a required second char (the inner group can be empty,
 *  but the trailing `[a-z0-9]` makes the total length at least two). */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;
const NAME_MAX = 200;

/**
 * Story 6-1 — organization provisioning.
 *
 * Creates an Organization row with the PRD-mandated defaults
 * (visibility = OWN_ONLY, approval = SINGLE, promotion_mode = CALIBRATION)
 * AND emits an `organization.created` outbox event in the SAME
 * transaction so the relay (Story 3-3) lands an audit_events row
 * atomically with the org's creation. If the outbox emit fails the org
 * never appears; if the org create fails the outbox row never appears.
 *
 * Slug uniqueness collisions surface as a 409 ConflictException so the
 * caller can distinguish "already exists" from "validation failed".
 */
@Injectable()
export class OrganizationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async provision(input: ProvisionInput): Promise<ProvisionedOrganization> {
    const slug = typeof input?.slug === 'string' ? input.slug.trim() : '';
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!slug || !SLUG_RE.test(slug)) {
      throw new BadRequestException({
        error: 'bad_request',
        message:
          'slug must be 2–63 chars, lowercase letters/digits/hyphens, no leading or trailing hyphen',
      });
    }
    if (!name || name.length > NAME_MAX) {
      throw new BadRequestException({
        error: 'bad_request',
        message: `name is required and must be ≤${NAME_MAX} chars`,
      });
    }

    const eventId = randomUUID();
    try {
      // Single transaction: organization INSERT + outbox INSERT are
      // committed together. The relay (Story 3-3) picks up the outbox
      // row via LISTEN/NOTIFY at COMMIT time; a rollback drops both.
      const result = await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            slug,
            name,
            // Defaults come from the Prisma schema's @default markers
            // (PRD §14.2 / §14.8 / §8.7), but the SELECT below pulls
            // them back so the audit payload + return shape don't drift
            // from the actual row state.
          },
          select: {
            id: true,
            slug: true,
            name: true,
            visibilityDefault: true,
            approvalWorkflowDefault: true,
            promotionMode: true,
            createdAt: true,
          },
        });
        await tx.outboxEvent.create({
          data: {
            eventId,
            organizationId: org.id,
            aggregateType: 'organization',
            aggregateId: org.id,
            eventType: 'organization.created',
            payload: {
              // Bootstrap-tooling has no user actor — the org has no
              // users yet at provision time. The relay persists this
              // as audit_events.actor_id = NULL (system event).
              actorId: null,
              reason: null,
              before: null,
              after: {
                slug: org.slug,
                name: org.name,
                visibilityDefault: org.visibilityDefault,
                approvalWorkflowDefault: org.approvalWorkflowDefault,
                promotionMode: org.promotionMode,
              },
            },
          },
        });
        return org;
      });

      return {
        id: result.id,
        slug: result.slug,
        name: result.name,
        visibilityDefault: result.visibilityDefault,
        approvalWorkflowDefault: result.approvalWorkflowDefault,
        promotionMode: result.promotionMode,
        createdAt: result.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Unique constraint violation on (slug). 409 distinguishes
        // "the slug is taken" from a validation 400 — operators
        // re-running a partially-completed bootstrap script need to
        // tell these cases apart.
        throw new ConflictException({
          error: 'conflict',
          message: `An organization with slug "${slug}" already exists`,
        });
      }
      throw err;
    }
  }
}
