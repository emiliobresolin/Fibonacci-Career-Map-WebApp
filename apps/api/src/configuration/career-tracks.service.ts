import { randomUUID } from 'node:crypto';

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
import { CareerTracksRepository, type CareerTrackRow } from './career-tracks.repository.js';

/** Input shape for create. `slug` is required and validated against
 *  SLUG_RE; `name` is required and bounded. `description` /
 *  `displayOrder` / `active` are optional with sane defaults. */
export type CreateCareerTrackInput = {
  slug: string;
  name: string;
  description?: string | null;
  displayOrder?: number;
};

/** Input for update — every field optional. The service computes
 *  before/after diffs by comparing the current row to the patch. */
export type UpdateCareerTrackInput = {
  slug?: string;
  name?: string;
  description?: string | null;
  displayOrder?: number;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;
const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;

/**
 * CareerTracksService (Story 7-1, PRD FR-6.1, §10.1).
 *
 * Wraps {@link CareerTracksRepository} with:
 *   • input validation (slug shape, name/description bounds)
 *   • soft-deactivation semantics (active = false; no hard delete)
 *   • per-mutation `configuration.changed` outbox emission inside the
 *     same transaction as the row write, so audit + state cannot
 *     diverge (the outbox-relay then persists to audit_events)
 *   • structured 400/404/409 surfaces for the controller to forward
 *
 * Why the service writes directly via the tx client rather than
 * delegating to `repo.create()` / `repo.update()`:
 *   The repository opens its own `withOrgScope` per call. To co-commit
 *   the audit-outbox row with the row write, the service must own one
 *   tx that performs both. Reads (list, findById) still go through the
 *   repository — there's no atomicity requirement to break.
 *
 * Audit payload shape (AC3): uses the existing `configuration.changed`
 * variant. `before.field = '*'` is a sentinel meaning "whole-row
 * change"; `beforeValue` / `afterValue` carry the full row state. This
 * encoding keeps audit-row count proportional to mutations (one event
 * per save) rather than per-field, which both matches the AC's
 * "before/after JSONB" wording and avoids exploding the audit volume.
 * Story 7-9 layers `change_type` + `affected_employee_ids[]` on top
 * for the bulk-recalc trigger.
 */
@Injectable()
export class CareerTracksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CareerTracksRepository) private readonly repo: CareerTracksRepository,
  ) {}

  async list(organizationId: string, opts: { includeInactive?: boolean } = {}): Promise<CareerTrackRow[]> {
    const rows = await this.repo.list(organizationId);
    return opts.includeInactive ? rows : rows.filter((r) => r.active);
  }

  async findById(organizationId: string, id: string): Promise<CareerTrackRow> {
    const row = await this.repo.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException({ error: 'not_found', message: 'Unknown career track' });
    }
    return row;
  }

  async create(
    organizationId: string,
    input: CreateCareerTrackInput,
    actor: ActorContext,
  ): Promise<CareerTrackRow> {
    const slug = validateSlug(input?.slug);
    const name = validateName(input?.name);
    const description = validateDescription(input?.description);
    const displayOrder = validateDisplayOrder(input?.displayOrder);

    try {
      return await withOrgScope(this.prisma, organizationId, async (tx) => {
        const row = await tx.careerTrack.create({
          data: {
            organizationId,
            slug,
            name,
            description,
            displayOrder,
            active: true,
          },
        });
        await emitConfigChanged(tx, organizationId, actor, row, null, row);
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          error: 'conflict',
          message: `A career track with slug "${slug}" already exists`,
        });
      }
      throw err;
    }
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateCareerTrackInput,
    actor: ActorContext,
  ): Promise<CareerTrackRow> {
    // Validate ONLY the fields the caller is touching. An empty PATCH
    // (no keys) is a no-op rather than a 400 — clients sometimes send
    // {} during form-state syncs; rejecting it is unhelpful.
    const patch: Prisma.CareerTrackUpdateInput = {};
    if (input?.slug !== undefined) patch.slug = validateSlug(input.slug);
    if (input?.name !== undefined) patch.name = validateName(input.name);
    if (input?.description !== undefined) patch.description = validateDescription(input.description);
    if (input?.displayOrder !== undefined) patch.displayOrder = validateDisplayOrder(input.displayOrder);
    if (Object.keys(patch).length === 0) {
      // No-op: just return current state. Skip audit emission so a
      // form-state sync doesn't pollute the audit log.
      return this.findById(organizationId, id);
    }

    try {
      return await withOrgScope(this.prisma, organizationId, async (tx) => {
        const before = await tx.careerTrack.findUnique({ where: { id } });
        if (!before) {
          throw new NotFoundException({ error: 'not_found', message: 'Unknown career track' });
        }
        const after = await tx.careerTrack.update({ where: { id }, data: patch });
        await emitConfigChanged(tx, organizationId, actor, after, before, after);
        return after;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          error: 'conflict',
          message: `A career track with that slug already exists`,
        });
      }
      throw err;
    }
  }

  /** Soft-deactivate (AC2). Sets `active = false`; no hard delete.
   *  Idempotent — deactivating an already-inactive track is a no-op
   *  (no audit emit). */
  async deactivate(
    organizationId: string,
    id: string,
    actor: ActorContext,
  ): Promise<CareerTrackRow> {
    return withOrgScope(this.prisma, organizationId, async (tx) => {
      const before = await tx.careerTrack.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException({ error: 'not_found', message: 'Unknown career track' });
      }
      if (!before.active) {
        // Already deactivated — return current state, do not emit a
        // duplicate audit event.
        return before;
      }
      const after = await tx.careerTrack.update({
        where: { id },
        data: { active: false },
      });
      await emitConfigChanged(tx, organizationId, actor, after, before, after);
      return after;
    });
  }
}

// ─── Validation helpers ────────────────────────────────────────────

function validateSlug(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'slug is required',
    });
  }
  const slug = raw.trim();
  if (!SLUG_RE.test(slug)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'slug must be 2–63 chars, lowercase letters/digits/hyphens, no leading or trailing hyphen',
    });
  }
  return slug;
}

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

/** Emit one `configuration.changed` outbox event for a row mutation.
 *  Uses `field: '*'` to signal a whole-row change; `beforeValue` and
 *  `afterValue` carry the full row state so downstream readers can
 *  reconstruct without re-fetching. */
async function emitConfigChanged(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actor: ActorContext,
  entityRow: CareerTrackRow,
  before: CareerTrackRow | null,
  after: CareerTrackRow | null,
): Promise<void> {
  // Cast through `Prisma.InputJsonValue` because Prisma's generated
  // type requires recursive JSON-value typing that `Record<string, unknown>`
  // does not satisfy. The runtime shape is JSON-serializable by
  // construction (UUIDs/strings/booleans/numbers/null + nested
  // serializeRow output), so the cast is safe.
  const payload: Prisma.InputJsonValue = {
    actorId: actor.user_id,
    reason: null,
    before: {
      configEntityType: 'career_track',
      configEntityId: entityRow.id,
      field: '*',
      beforeValue: before === null ? null : (serializeRow(before) as Prisma.InputJsonValue),
    },
    after: {
      afterValue: after === null ? null : (serializeRow(after) as Prisma.InputJsonValue),
    },
  };
  await tx.outboxEvent.create({
    data: {
      eventId: randomUUID(),
      organizationId,
      aggregateType: 'configuration',
      aggregateId: entityRow.id,
      eventType: 'configuration.changed',
      payload,
    },
  });
}

/** Serialize a CareerTrackRow for the audit payload. Dates become ISO
 *  strings so the JSONB column stores a stable canonical shape. */
function serializeRow(row: CareerTrackRow): Record<string, unknown> {
  return {
    id: row.id,
    organizationId: row.organizationId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    displayOrder: row.displayOrder,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
