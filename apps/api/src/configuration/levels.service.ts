import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { ActorContext } from '../auth/actor-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import { CareerTracksRepository } from './career-tracks.repository.js';
import { LevelsRepository, type LevelRow } from './levels.repository.js';

export type CreateLevelInput = {
  levelCode: string;
  name: string;
  scoreBandStart: number;
  scoreBandEnd: number;
  displayOrder?: number;
};

export type UpdateLevelInput = {
  levelCode?: string;
  name?: string;
  scoreBandStart?: number;
  scoreBandEnd?: number;
  displayOrder?: number;
};

export type LevelBandConflict = {
  conflicting_level_id: string | null;
  conflicting_band: { start: number; end: number };
};

// Allow letters/digits/underscore/hyphen, 1–32 chars. Must start AND end
// with letter or digit so `L1-`, `L1_`, `--L1`, `__L1` are all rejected.
// Single-char codes (`A`) are permitted because some orgs use one-letter
// levels (M, S, J).
const LEVEL_CODE_RE = /^[A-Za-z0-9]([A-Za-z0-9_\-]{0,30}[A-Za-z0-9])?$/;
const NAME_MAX = 200;
const SCORE_BAND_MAX = 1_000_000;
const OVERLAP_CONSTRAINT_NAME = 'levels_band_non_overlap';

/**
 * LevelsService (Story 7-2, PRD FR-6.2 §8.2, Arch §6.2).
 *
 * Mirrors {@link import('./career-tracks.service.js').CareerTracksService}:
 *   • validates input shape at the service boundary (400 before DB)
 *   • runs every write inside `withOrgScope` so RLS + the row write +
 *     the `configuration.changed` outbox emission co-commit in one tx
 *   • surfaces P2002 (unique levelCode) as 409 conflict
 *   • translates the DB exclusion-constraint violation
 *     `levels_band_non_overlap` (SQLSTATE 23P01) into a structured
 *     409 LEVEL_BAND_OVERLAP with the conflicting row's id and band
 *
 * Why the DB is the source of truth for non-overlap (AC2):
 *   A TypeScript-only pre-check would race with concurrent inserts
 *   from the same tenant. The migration shipped in Story 6-2 defines
 *   a GiST EXCLUDE constraint scoped to `(career_track_id, int4range
 *   ('[]')) WHERE active = true`. We let Postgres enforce it and
 *   translate the resulting error for the controller layer.
 *
 * Audit-emission shape (AC4) is identical to CareerTracksService's
 * `configuration.changed` payload, swapping `configEntityType` to
 * `'level'`. The relay (Story 3-3) persists to audit_events.
 */
@Injectable()
export class LevelsService {
  private readonly logger = new Logger(LevelsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LevelsRepository) private readonly repo: LevelsRepository,
    @Inject(CareerTracksRepository) private readonly tracksRepo: CareerTracksRepository,
  ) {}

  async listByTrack(organizationId: string, careerTrackId: string): Promise<LevelRow[]> {
    await this.assertTrackExists(organizationId, careerTrackId);
    return this.repo.listByTrack(organizationId, careerTrackId);
  }

  async findById(organizationId: string, id: string): Promise<LevelRow> {
    const row = await this.repo.findById(organizationId, id);
    if (!row) {
      throw new NotFoundException({ error: 'not_found', message: 'Unknown level' });
    }
    return row;
  }

  async create(
    organizationId: string,
    careerTrackId: string,
    input: CreateLevelInput,
    actor: ActorContext,
  ): Promise<LevelRow> {
    await this.assertTrackExists(organizationId, careerTrackId);

    const levelCode = validateLevelCode(input?.levelCode);
    const name = validateName(input?.name);
    const { scoreBandStart, scoreBandEnd } = validateBand(
      input?.scoreBandStart,
      input?.scoreBandEnd,
    );
    const displayOrder = validateDisplayOrder(input?.displayOrder);

    try {
      return await withOrgScope(this.prisma, organizationId, async (tx) => {
        const row = await tx.level.create({
          data: {
            organizationId,
            careerTrackId,
            levelCode,
            name,
            scoreBandStart,
            scoreBandEnd,
            displayOrder,
            active: true,
          },
        });
        await emitConfigChanged(tx, organizationId, actor, row, null, row);
        return row;
      });
    } catch (err) {
      throw await this.translateWriteError(err, organizationId, careerTrackId, {
        band: { start: scoreBandStart, end: scoreBandEnd },
        excludeLevelId: null,
      });
    }
  }


  async update(
    organizationId: string,
    id: string,
    input: UpdateLevelInput,
    actor: ActorContext,
  ): Promise<LevelRow> {
    // Empty PATCH ({}): treat as no-op (see Story 7-1 — form-state sync).
    // Any provided field is validated synchronously so a malformed input
    // (e.g. { scoreBandStart: -1 }) still gets a 400 even though the band
    // pair is finalized inside the tx (we need `before` for partial-band
    // merging).
    const patch: Prisma.LevelUpdateInput = {};
    if (input?.levelCode !== undefined) patch.levelCode = validateLevelCode(input.levelCode);
    if (input?.name !== undefined) patch.name = validateName(input.name);
    if (input?.displayOrder !== undefined) patch.displayOrder = validateDisplayOrder(input.displayOrder);
    const touchingBand = input?.scoreBandStart !== undefined || input?.scoreBandEnd !== undefined;
    if (Object.keys(patch).length === 0 && !touchingBand) {
      return this.findById(organizationId, id);
    }

    // Track the finalized band (only when touching) so the catch block
    // can enrich an exclusion-violation 409. Captured by the tx callback
    // closure so the outer catch sees the post-validation values.
    let finalizedBand: { start: number; end: number } | null = null;
    let trackIdForLookup: string | null = null;

    try {
      return await withOrgScope(this.prisma, organizationId, async (tx) => {
        const before = await tx.level.findUnique({ where: { id } });
        if (!before) {
          throw new NotFoundException({ error: 'not_found', message: 'Unknown level' });
        }
        trackIdForLookup = before.careerTrackId;
        if (touchingBand) {
          const proposedStart = input!.scoreBandStart ?? before.scoreBandStart;
          const proposedEnd = input!.scoreBandEnd ?? before.scoreBandEnd;
          const { scoreBandStart, scoreBandEnd } = validateBand(proposedStart, proposedEnd);
          patch.scoreBandStart = scoreBandStart;
          patch.scoreBandEnd = scoreBandEnd;
          finalizedBand = { start: scoreBandStart, end: scoreBandEnd };
        }
        const after = await tx.level.update({ where: { id }, data: patch });
        await emitConfigChanged(tx, organizationId, actor, after, before, after);
        return after;
      });
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      // If we never set finalizedBand, the caller did not touch the band.
      // Translating an exclusion violation in that case is impossible to
      // report honestly (we don't know which band was being claimed), so
      // we rethrow as-is rather than fabricate `{start: 0, end: 0}`.
      // Unique-constraint (P2002) on (career_track_id, level_code) is
      // still translated below.
      throw await this.translateWriteError(err, organizationId, trackIdForLookup, {
        band: finalizedBand,
        excludeLevelId: id,
      });
    }
  }

  /** Soft-deactivate (AC3). Flips `active = false`; never deletes the row.
   *  Idempotent: deactivating an already-inactive level is a no-op and
   *  emits no audit event. */
  async deactivate(
    organizationId: string,
    id: string,
    actor: ActorContext,
  ): Promise<LevelRow> {
    return withOrgScope(this.prisma, organizationId, async (tx) => {
      const before = await tx.level.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException({ error: 'not_found', message: 'Unknown level' });
      }
      if (!before.active) {
        return before;
      }
      const after = await tx.level.update({
        where: { id },
        data: { active: false },
      });
      await emitConfigChanged(tx, organizationId, actor, after, before, after);
      return after;
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async assertTrackExists(organizationId: string, careerTrackId: string): Promise<void> {
    const track = await this.tracksRepo.findById(organizationId, careerTrackId);
    if (!track) {
      throw new NotFoundException({ error: 'not_found', message: 'Unknown career track' });
    }
  }

  private async translateWriteError(
    err: unknown,
    organizationId: string,
    careerTrackId: string | null,
    ctx: {
      band: { start: number; end: number } | null;
      excludeLevelId: string | null;
    },
  ): Promise<Error> {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException({
        error: 'conflict',
        message: 'A level with that code already exists in this career track',
      });
    }
    if (isExclusionViolation(err)) {
      // If we don't have a band to translate against (caller didn't touch
      // band fields, or row lookup failed), rethrow as-is. Fabricating a
      // 409 body without honest band coordinates would mislead the admin
      // UI's "highlight the conflicting row" affordance.
      if (ctx.band === null || careerTrackId === null) {
        return err as Error;
      }
      const conflict = await this.findOverlappingLevel(
        organizationId,
        careerTrackId,
        ctx.band.start,
        ctx.band.end,
        ctx.excludeLevelId,
      );
      // Note: `conflicting_level_id: null` is possible under concurrency
      // when the peer was deactivated between the failed write and this
      // enrichment query. The admin UI should treat `null` as
      // "conflict no longer pinpointed; please re-fetch the track".
      return new ConflictException({
        error: 'level_band_overlap',
        message:
          conflict !== null
            ? `Score band [${ctx.band.start}, ${ctx.band.end}] overlaps active level ${conflict.id} (band [${conflict.scoreBandStart}, ${conflict.scoreBandEnd}])`
            : `Score band [${ctx.band.start}, ${ctx.band.end}] overlaps an existing active level in this track`,
        conflicting_level_id: conflict?.id ?? null,
        conflicting_band:
          conflict !== null
            ? { start: conflict.scoreBandStart, end: conflict.scoreBandEnd }
            : { start: ctx.band.start, end: ctx.band.end },
      } satisfies { error: 'level_band_overlap'; message: string } & LevelBandConflict);
    }
    return err as Error;
  }

  /** Find an active level in the same track whose inclusive band overlaps
   *  `[start, end]`. Uses Postgres `int4range(..., '[]')` overlap operator
   *  for consistency with the DB constraint. Excludes the row being updated
   *  so an update that keeps the same band doesn't match itself. */
  private async findOverlappingLevel(
    organizationId: string,
    careerTrackId: string,
    start: number,
    end: number,
    excludeLevelId: string | null,
  ): Promise<{ id: string; scoreBandStart: number; scoreBandEnd: number } | null> {
    try {
      const rows = await withOrgScope(this.prisma, organizationId, async (tx) => {
        // $queryRaw with parameterized inputs — never string-concat.
        if (excludeLevelId === null) {
          return tx.$queryRaw<{ id: string; score_band_start: number; score_band_end: number }[]>`
            SELECT id, score_band_start, score_band_end
              FROM levels
             WHERE career_track_id = ${careerTrackId}::uuid
               AND active = true
               AND int4range(score_band_start, score_band_end, '[]')
                && int4range(${start}::int, ${end}::int, '[]')
             LIMIT 1
          `;
        }
        return tx.$queryRaw<{ id: string; score_band_start: number; score_band_end: number }[]>`
          SELECT id, score_band_start, score_band_end
            FROM levels
           WHERE career_track_id = ${careerTrackId}::uuid
             AND active = true
             AND id <> ${excludeLevelId}::uuid
             AND int4range(score_band_start, score_band_end, '[]')
              && int4range(${start}::int, ${end}::int, '[]')
           LIMIT 1
        `;
      });
      if (rows.length === 0) return null;
      const r = rows[0]!;
      return { id: r.id, scoreBandStart: r.score_band_start, scoreBandEnd: r.score_band_end };
    } catch (lookupErr) {
      // Best-effort enrichment; if the lookup itself fails we still
      // return the 409 with conflicting_level_id: null. Log so operators
      // can spot a real DB problem instead of silently degrading the
      // 409 body forever.
      this.logger.warn(
        `findOverlappingLevel failed for org=${organizationId} track=${careerTrackId} band=[${start},${end}]: ${
          lookupErr instanceof Error ? lookupErr.message : String(lookupErr)
        }`,
      );
      return null;
    }
  }
}

// ─── Validation helpers ────────────────────────────────────────────

function validateLevelCode(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new BadRequestException({ error: 'bad_request', message: 'levelCode is required' });
  }
  const code = raw.trim();
  if (!LEVEL_CODE_RE.test(code)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'levelCode must be 1-32 chars of letters, digits, underscore, or hyphen, starting with letter/digit',
    });
  }
  return code;
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

function validateBand(
  rawStart: unknown,
  rawEnd: unknown,
): { scoreBandStart: number; scoreBandEnd: number } {
  if (
    typeof rawStart !== 'number' ||
    !Number.isInteger(rawStart) ||
    rawStart < 0 ||
    rawStart > SCORE_BAND_MAX
  ) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `scoreBandStart must be a non-negative integer ≤${SCORE_BAND_MAX}`,
    });
  }
  if (
    typeof rawEnd !== 'number' ||
    !Number.isInteger(rawEnd) ||
    rawEnd < 0 ||
    rawEnd > SCORE_BAND_MAX
  ) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `scoreBandEnd must be a non-negative integer ≤${SCORE_BAND_MAX}`,
    });
  }
  if (rawEnd <= rawStart) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'scoreBandEnd must be strictly greater than scoreBandStart',
    });
  }
  return { scoreBandStart: rawStart, scoreBandEnd: rawEnd };
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

/**
 * True iff `err` is a Prisma error whose underlying Postgres failure was
 * an exclusion-constraint violation on `levels_band_non_overlap`.
 *
 * Prisma surfaces `EXCLUDE`-constraint failures in one of two ways
 * depending on driver version:
 *   • As `PrismaClientKnownRequestError` with `code: 'P2010'` (raw-query
 *     failure) — the underlying SQLSTATE/constraint name is in `meta`.
 *   • As `PrismaClientUnknownRequestError` — only `err.message` carries
 *     the Postgres error text.
 *
 * We accept either. The match is scoped to `Prisma.*` error instances
 * specifically — we deliberately do NOT match plain `Error` objects
 * whose message happens to contain the constraint name, to avoid
 * mistranslating an unrelated bug.
 */
function isExclusionViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = (err.meta as Record<string, unknown> | undefined) ?? undefined;
    const sqlstate = typeof meta?.code === 'string' ? meta.code : undefined;
    const constraint = typeof meta?.constraint === 'string' ? meta.constraint : undefined;
    if (sqlstate === '23P01' && constraint === OVERLAP_CONSTRAINT_NAME) return true;
    if (typeof err.message === 'string' && err.message.includes(OVERLAP_CONSTRAINT_NAME)) {
      return true;
    }
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    if (typeof err.message === 'string' && err.message.includes(OVERLAP_CONSTRAINT_NAME)) {
      return true;
    }
  }
  return false;
}

/** Emit one `configuration.changed` outbox event for a level mutation. */
async function emitConfigChanged(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actor: ActorContext,
  entityRow: LevelRow,
  before: LevelRow | null,
  after: LevelRow | null,
): Promise<void> {
  const payload: Prisma.InputJsonValue = {
    actorId: actor.user_id,
    reason: null,
    before: {
      configEntityType: 'level',
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

function serializeRow(row: LevelRow): Record<string, unknown> {
  return {
    id: row.id,
    organizationId: row.organizationId,
    careerTrackId: row.careerTrackId,
    levelCode: row.levelCode,
    name: row.name,
    scoreBandStart: row.scoreBandStart,
    scoreBandEnd: row.scoreBandEnd,
    displayOrder: row.displayOrder,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
