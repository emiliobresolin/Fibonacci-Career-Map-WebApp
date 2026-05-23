import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { ActorContext } from '../auth/actor-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import { emitEvidenceSubmitted } from './audit.js';
import {
  EvidenceStateMachine,
  IllegalEvidenceTransitionError,
} from './evidence-state-machine.js';
import { isKeyInOrgScope } from './evidence-key.js';
import {
  EVIDENCE_STORAGE,
  type EvidenceStorage,
} from './evidence-storage.port.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FinalizeInput = {
  evidenceId: string;
  key: string;
};

export type FinalizeResult = {
  evidenceId: string;
  state: 'PENDING_APPROVAL';
  storageObjectKey: string;
  storageEtag: string;
  contentType: string;
  sizeBytes: number;
  submittedAt: string;
};

/**
 * Finalize the upload: HEAD the object, capture metadata, transition
 * DRAFT → PENDING_APPROVAL, emit `evidence.submitted` (Story 8-2 AC2 +
 * AC3, Arch §9.1 step 3 / 4).
 *
 * The endpoint accepts both `evidenceId` and `key` from the client.
 * Even though the server stored the canonical key in the DRAFT row at
 * upload-slot time, accepting the client's key surfaces AC3 as an
 * explicit `403 FORBIDDEN_SCOPE` rather than an implicit "row not
 * found" — the difference matters for forensics when an attacker
 * tries to pivot a session.
 *
 * Order of operations (deliberate — read carefully):
 *   1. Validate inputs (well-formed UUIDs, key string).
 *   2. AC3 scope check — `key` must be under
 *      `org/{actor.organization_id}/evidence/...` → else 403
 *      FORBIDDEN_SCOPE. Fails closed BEFORE any DB or S3 IO so a
 *      cross-org probe leaks no timing.
 *   3. Open `withOrgScope` tx + SELECT FOR UPDATE on the DRAFT row.
 *      Row-not-found, wrong-requirement, key-mismatch, and illegal
 *      state-machine transitions all surface here.
 *   4. HEAD the object — inside the tx so the lock is held for the
 *      duration. Trade: slower HEAD = longer lock. Acceptable for
 *      evidence-finalize (low-volume, one PUT per actor at a time).
 *      Reason for inside-the-tx: HEAD-before-tx leaks intra-org
 *      evidence-id existence via timing / 404-vs-403 differential
 *      (an attacker in org A could enumerate other A-employees'
 *      evidence ids by HEADing keys before the DB lookup fires). The
 *      tx-first order closes the gap.
 *   5. AC1 byte-cap enforcement — assert `head.sizeBytes` matches the
 *      `sizeBytes` pinned on the DRAFT row at upload-slot time. The
 *      presigned PUT URL does NOT SigV4-sign Content-Length on the
 *      browser-PUT path, so S3 itself accepts any body size; the
 *      enforcement happens here at finalize. A mismatched size is
 *      treated as a 400, NOT a state-machine transition — the row
 *      stays DRAFT and the orphaned object is left in S3 for a
 *      future GC sweep.
 *   6. Write metadata + submitted_at + state.
 *   7. Emit `evidence.submitted` outbox event inside the same tx so
 *      audit + state cannot diverge (outbox-pattern guarantee).
 *   8. Commit.
 */
@Injectable()
export class EvidenceFinalizeService {
  private readonly logger = new Logger(EvidenceFinalizeService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EVIDENCE_STORAGE) private readonly storage: EvidenceStorage,
  ) {}

  async finalize(
    actor: ActorContext,
    requirementId: string,
    input: FinalizeInput,
  ): Promise<FinalizeResult> {
    if (!UUID_RE.test(requirementId)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'requirementId must be a UUID',
      });
    }
    const evidenceId = validateUuidInput(input?.evidenceId, 'evidenceId');
    const key = validateKeyInput(input?.key);

    // AC3 — scope check fires BEFORE the DB lookup so a cross-org
    // attempt cannot use response timing to enumerate evidence ids.
    if (!isKeyInOrgScope(key, actor.organization_id)) {
      throw new ForbiddenException({
        error: 'FORBIDDEN_SCOPE',
        message: 'Object key is outside the caller organization scope',
      });
    }

    return await withOrgScope(this.prisma, actor.organization_id, async (tx) => {
      // SELECT ... FOR UPDATE on the DRAFT row. Two correctness
      // guarantees:
      //   • A concurrent second finalize against the same row blocks
      //     here until our tx commits; on resume it re-reads state =
      //     PENDING_APPROVAL and the state-machine rejects.
      //   • The UPDATE later in this method writes to the row we
      //     already hold — same row lock, no second acquisition needed.
      // The parameterized `${evidenceId}::uuid` binding is the only
      // value substituted into the literal SQL — no injection
      // surface here.
      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          state: string;
          requirement_id: string;
          storage_object_key: string | null;
          employee_id: string;
          size_bytes: bigint | null;
        }>
      >(Prisma.sql`
        SELECT id, state, requirement_id, storage_object_key, employee_id, size_bytes
          FROM evidence
         WHERE id = ${evidenceId}::uuid
         FOR UPDATE
      `);
      const row = locked[0];
      if (!row) {
        throw new NotFoundException({
          error: 'not_found',
          message: 'Unknown evidence id',
        });
      }
      if (row.requirement_id !== requirementId) {
        throw new BadRequestException({
          error: 'bad_request',
          message: 'evidenceId does not belong to this requirement',
        });
      }
      if (row.storage_object_key !== key) {
        // The DRAFT row's stored key disagrees with the client's
        // claim. Forensically distinct from a cross-org scope error
        // (AC3) — that one means "key has wrong prefix"; this means
        // "key is properly prefixed but doesn't match the row".
        throw new ForbiddenException({
          error: 'FORBIDDEN_SCOPE',
          message: 'Supplied key does not match the evidence record',
        });
      }
      try {
        EvidenceStateMachine.assertCanTransition(
          row.state as 'DRAFT',
          'PENDING_APPROVAL',
        );
      } catch (err) {
        if (err instanceof IllegalEvidenceTransitionError) {
          throw new ConflictException({
            error: 'illegal_state_transition',
            message: err.message,
            from: err.from,
            to: err.to,
          });
        }
        throw err;
      }

      // HEAD the object now that we own the row lock. A non-404 S3
      // failure surfaces as 502 — the cause string is logged, not
      // returned, to avoid leaking bucket / region / request-id
      // metadata into the public API response body.
      let head;
      try {
        head = await this.storage.head(key);
      } catch (err) {
        this.logger.error(`HEAD failed for ${key}: ${(err as Error).message}`);
        throw new BadGatewayException({
          error: 'storage_unavailable',
          message: 'Failed to verify uploaded object',
        });
      }
      if (!head) {
        throw new NotFoundException({
          error: 'not_found',
          message: 'Uploaded object does not exist at the supplied key',
        });
      }

      // AC1 — content-length-range enforcement at finalize. The
      // presigned PUT URL does not actually sign Content-Length
      // (browser-PUT compat), so S3 accepts any body up to its
      // single-PUT ceiling. Compare what landed in S3 against the
      // size the client declared at upload-slot creation (stored on
      // the DRAFT row); mismatch → 400.
      const declared = row.size_bytes !== null ? Number(row.size_bytes) : null;
      if (declared === null || head.sizeBytes !== declared) {
        throw new BadRequestException({
          error: 'CONTENT_LENGTH_MISMATCH',
          message:
            declared === null
              ? 'Cannot finalize: declared upload size is missing'
              : `Uploaded object size (${head.sizeBytes} B) does not match the declared upload size (${declared} B)`,
        });
      }

      const submittedAt = new Date();
      const updated = await tx.evidence.update({
        where: { id: row.id },
        data: {
          state: 'PENDING_APPROVAL',
          storageEtag: head.etag,
          // contentType was pinned at upload-slot from the client
          // input; the HEAD value should match (S3 stores what was
          // signed). We DO refresh from HEAD here so a future
          // requirement-side policy change (e.g. tighter MIME
          // allow-list at finalize) doesn't read a stale value.
          contentType: head.contentType,
          // sizeBytes is identical to row.size_bytes by the check
          // above — re-writing is a no-op but keeps the wire shape
          // explicit.
          sizeBytes: BigInt(head.sizeBytes),
          submittedAt,
        },
      });

      await emitEvidenceSubmitted(tx, actor.organization_id, actor, {
        evidenceId: updated.id,
        requirementId: updated.requirementId,
        employeeId: updated.employeeId,
      });

      return {
        evidenceId: updated.id,
        state: 'PENDING_APPROVAL' as const,
        storageObjectKey: updated.storageObjectKey!,
        storageEtag: updated.storageEtag!,
        contentType: updated.contentType!,
        sizeBytes: Number(updated.sizeBytes!),
        submittedAt: submittedAt.toISOString(),
      };
    });
  }
}

function validateUuidInput(raw: unknown, name: string): string {
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
    throw new BadRequestException({
      error: 'bad_request',
      message: `${name} must be a UUID`,
    });
  }
  return raw;
}

function validateKeyInput(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'key must be a string',
    });
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'key is required',
    });
  }
  // Cap to a sane upper bound. S3 keys can be up to 1024 bytes; we
  // cap shorter so a maliciously long key doesn't tie up CPU in regex
  // ops downstream.
  if (trimmed.length > 1024) {
    throw new BadRequestException({
      error: 'bad_request',
      message: 'key is too long',
    });
  }
  return trimmed;
}
