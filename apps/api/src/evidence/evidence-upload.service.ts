import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ActorContext } from '../auth/actor-context.js';
import type { Env } from '../common/env.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import {
  buildEvidenceKey,
  InvalidEvidenceKeyError,
  validateFilename,
} from './evidence-key.js';
import {
  EVIDENCE_STORAGE,
  type EvidenceStorage,
} from './evidence-storage.port.js';
import { EvidenceStorageNotConfiguredError } from './aws-s3-evidence-storage.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loose MIME-type sanity regex (`type/subtype`). Not an allow-list —
 *  per-org content-type policy is out of scope for this story. The
 *  presigned URL pins Content-Type, so the browser must echo this
 *  exact value on the PUT or S3 rejects with 403. */
const MIME_RE = /^[a-z]+\/[a-z0-9._+-]+$/i;

export type CreateUploadSlotInput = {
  contentType: string;
  contentLength: number;
  filename: string;
};

export type CreateUploadSlotResult = {
  evidenceId: string;
  key: string;
  uploadUrl: string;
  expiresAt: string;
  contentLengthRange: { min: number; max: number };
};

/**
 * Issues a pre-signed S3 PUT URL the browser uses to upload an
 * evidence file directly to object storage (Story 8-2 AC1, Arch §9.1).
 *
 * Flow:
 *   1. Resolve the requirement (RLS-scoped to actor.organizationId) and
 *      assert it is active + FILE-type. TEXT / URL / STRUCTURED
 *      requirements have a different submission path (future story).
 *   2. Resolve the actor's employee row in this org. Submitting
 *      evidence requires an Employee record — actor + org alone is
 *      not enough (the audit-trail FK needs an `employee_id`).
 *   3. Create a fresh DRAFT evidence row inside `withOrgScope` so the
 *      RLS GUC + write co-commit. The row carries the server-derived
 *      key — finalize cross-checks against it for defense in depth.
 *   4. Generate the presigned PUT URL with the configured TTL,
 *      pinned ContentType + ContentLength.
 *
 * Single-use posture (AC1): the URL is reusable within its TTL, but
 * the evidence row is single-use — each upload-slot call creates a
 * fresh row with a fresh uuid embedded in the key, and finalize
 * transitions DRAFT → PENDING_APPROVAL exactly once. A second
 * finalize against the same row fails the state-machine check.
 *
 * Returns enough to drive the browser PUT plus the metadata the
 * finalize call later requires.
 */
@Injectable()
export class EvidenceUploadService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EVIDENCE_STORAGE) private readonly storage: EvidenceStorage,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async createUploadSlot(
    actor: ActorContext,
    requirementId: string,
    input: CreateUploadSlotInput,
  ): Promise<CreateUploadSlotResult> {
    if (!UUID_RE.test(requirementId)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'requirementId must be a UUID',
      });
    }
    const contentType = validateContentType(input?.contentType);
    const minBytes = Number(this.config.get('EVIDENCE_UPLOAD_MIN_BYTES'));
    const maxBytes = Number(this.config.get('EVIDENCE_UPLOAD_MAX_BYTES'));
    const contentLength = validateContentLength(input?.contentLength, minBytes, maxBytes);
    let filename: string;
    try {
      filename = validateFilename(input?.filename);
    } catch (err) {
      if (err instanceof InvalidEvidenceKeyError) {
        throw new BadRequestException({ error: 'bad_request', message: err.message });
      }
      throw err;
    }

    const ttlSeconds = Number(this.config.get('EVIDENCE_UPLOAD_SLOT_TTL_SECONDS'));

    // 1+2+3 — all inside a single withOrgScope tx so the requirement
    // lookup, employee lookup, and DRAFT row creation co-commit.
    const draft = await withOrgScope(this.prisma, actor.organization_id, async (tx) => {
      const requirement = await tx.requirement.findUnique({ where: { id: requirementId } });
      if (!requirement) {
        throw new NotFoundException({
          error: 'not_found',
          message: 'Unknown requirement',
        });
      }
      if (!requirement.active) {
        throw new ConflictException({
          error: 'conflict',
          message: 'Requirement is deactivated; cannot submit evidence',
        });
      }
      if (requirement.evidenceType !== 'FILE') {
        throw new BadRequestException({
          error: 'bad_request',
          message: `This requirement accepts ${requirement.evidenceType} evidence, not file uploads`,
        });
      }
      const employee = await tx.employee.findFirst({
        where: {
          userId: actor.user_id,
          organizationId: actor.organization_id,
          deactivatedAt: null,
        },
      });
      if (!employee) {
        throw new NotFoundException({
          error: 'not_found',
          message: 'No active employee record for the current user',
        });
      }
      const evidenceId = randomUUID();
      const key = buildEvidenceKey({
        organizationId: actor.organization_id,
        employeeId: employee.id,
        evidenceId,
        filename,
      });
      const row = await tx.evidence.create({
        data: {
          id: evidenceId,
          organizationId: actor.organization_id,
          employeeId: employee.id,
          requirementId: requirement.id,
          state: 'DRAFT',
          storageObjectKey: key,
          // Pin the declared content length on the DRAFT row. The
          // presigned PUT URL's ContentLength is NOT SigV4-signed
          // (browser-PUT compat), so S3 itself does not enforce the
          // byte cap — finalize re-reads `size_bytes` from the HEAD
          // response and rejects when the actual upload differs from
          // the declared length. Without this pin, an attacker could
          // declare 1 KB to pass `validateContentLength` and then PUT
          // any size up to S3's 5 GiB single-PUT ceiling.
          contentType,
          sizeBytes: BigInt(contentLength),
        },
      });
      return { evidenceId: row.id, key };
    });

    // 4 — sign the URL. We deliberately do this OUTSIDE the tx so the
    // DB connection is released before the (potentially slow / failing)
    // SDK call. A failure here leaves an orphan DRAFT row that the
    // client can retry from; future GC story will sweep stale DRAFTs.
    let presigned;
    try {
      presigned = await this.storage.presignPut({
        key: draft.key,
        contentType,
        contentLength,
        ttlSeconds,
      });
    } catch (err) {
      if (err instanceof EvidenceStorageNotConfiguredError) {
        throw new ServiceUnavailableException({
          error: 'service_unavailable',
          message: 'Evidence storage is not configured on this deployment',
        });
      }
      throw err;
    }

    return {
      evidenceId: draft.evidenceId,
      key: draft.key,
      uploadUrl: presigned.url,
      expiresAt: presigned.expiresAt.toISOString(),
      contentLengthRange: { min: minBytes, max: maxBytes },
    };
  }
}

// ─── input validators ──────────────────────────────────────────────

function validateContentType(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new BadRequestException({ error: 'bad_request', message: 'contentType is required' });
  }
  const trimmed = raw.trim();
  if (!MIME_RE.test(trimmed)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'contentType must be a MIME type of the form "type/subtype"',
    });
  }
  return trimmed;
}

function validateContentLength(raw: unknown, min: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'contentLength must be a non-negative integer (bytes)',
    });
  }
  if (raw < min) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `contentLength must be ≥${min} bytes (got ${raw})`,
    });
  }
  if (raw > max) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `contentLength must be ≤${max} bytes (got ${raw})`,
    });
  }
  return raw;
}
