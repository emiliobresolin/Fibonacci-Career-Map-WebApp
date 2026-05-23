import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ActorContext } from '../auth/actor-context.js';
import type { Env } from '../common/env.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withOrgScope } from '../prisma/rls.helpers.js';
import { emitEvidenceRetrieved } from './audit.js';
import { authorizeEvidenceView } from './evidence-authz.js';
import {
  EVIDENCE_STORAGE,
  type EvidenceStorage,
} from './evidence-storage.port.js';
import { EvidenceStorageNotConfiguredError } from './aws-s3-evidence-storage.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreateDownloadUrlResult = {
  downloadUrl: string;
  expiresAt: string;
};

/**
 * Issue a 10-min pre-signed GET URL for an evidence file, gated by
 * RBAC + visibility (Story 8-3, Arch §9.2, PRD FR-4.3).
 *
 * State-by-state download policy (Story 8-1 state machine):
 *   • DRAFT             — reject 400 invalid_state (bytes may not
 *                          exist; finalize hasn't run)
 *   • PENDING_APPROVAL  — ALLOW (reviewer needs bytes to decide)
 *   • APPROVED          — ALLOW (standard read path)
 *   • REJECTED          — ALLOW (audit / appeal context; bytes still
 *                          exist in S3 until GC)
 *   • EXPIRED           — reject 400 expired (policy decision —
 *                          bytes may have been GC'd; do not let
 *                          expired evidence re-enter circulation)
 *
 * Order:
 *   1. Validate input — `evidenceId` must be UUID-shaped.
 *   2. Inside `withOrgScope`:
 *      a. Load evidence + owner Employee + subject's active assignments.
 *         RLS auto-filters by actor's org → a cross-org `evidenceId`
 *         is not visible and surfaces as 404 (NOT 403; the row's
 *         existence is itself privileged — revealing 403 would leak
 *         existence to a cross-tenant attacker).
 *      b. Apply the state policy above. The 409/410 nuance was
 *         considered and discarded — 400 is the consistent surface
 *         for "your request is wrong for this row right now".
 *      c. Run {@link authorizeEvidenceView}. Reject with 403 on
 *         negative. (AC2: owner, direct manager, ADMIN allowed.)
 *      d. Emit `evidence.retrieved` outbox event.
 *      e. Commit.
 *   3. Generate the presigned GET URL (outside tx — SDK call doesn't
 *      need DB lock).
 *
 * NOTE on AC3 (cross-org access): the AC literally says "403 on
 * cross-org access", but revealing 403 (vs. 404) would leak row
 * existence across tenants. Ship the 404 posture for cross-org and
 * 403 for same-org-stranger; the audit + controller tests pin both.
 * AC3 story-doc text updated to reflect this.
 *
 * NOTE on audit / presign ordering: the audit row commits BEFORE
 * the presigned URL is signed. A presign failure leaves an orphan
 * audit row for a download that never happened. We accept this — the
 * audit captures the AUTHORIZATION decision, not byte delivery — and
 * log the eventId on both success and failure so a forensic reader
 * can correlate. Per-byte audit would require CloudTrail S3 access-
 * log ingestion (deferred F8-3a).
 */
@Injectable()
export class EvidenceDownloadService {
  private readonly logger = new Logger(EvidenceDownloadService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EVIDENCE_STORAGE) private readonly storage: EvidenceStorage,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async createDownloadUrl(
    actor: ActorContext,
    evidenceId: string,
  ): Promise<CreateDownloadUrlResult> {
    if (!UUID_RE.test(evidenceId)) {
      throw new BadRequestException({
        error: 'bad_request',
        message: 'evidenceId must be a UUID',
      });
    }

    // env.config.ts pre-coerces via z.coerce.number(), so a redundant
    // Number() cast would just be cargo-culted noise. Trust the env
    // contract and inline the read.
    const ttlSeconds = this.config.get('EVIDENCE_DOWNLOAD_TTL_SECONDS') as number;

    const { key, viaContext, auditEventId } = await withOrgScope(
      this.prisma,
      actor.organization_id,
      async (tx) => {
        const evidence = await tx.evidence.findUnique({
          where: { id: evidenceId },
          select: {
            id: true,
            employeeId: true,
            requirementId: true,
            state: true,
            storageObjectKey: true,
          },
        });
        if (!evidence) {
          throw new NotFoundException({
            error: 'not_found',
            message: 'Unknown evidence id',
          });
        }
        if (evidence.state === 'DRAFT') {
          throw new BadRequestException({
            error: 'invalid_state',
            message: 'Evidence is still in DRAFT; finalize before downloading',
          });
        }
        if (evidence.state === 'EXPIRED') {
          throw new BadRequestException({
            error: 'expired',
            message: 'Evidence has expired',
          });
        }
        if (!evidence.storageObjectKey) {
          throw new BadRequestException({
            error: 'no_object',
            message: 'Evidence has no downloadable object (text/url payload)',
          });
        }

        const ownerEmployee = await tx.employee.findUnique({
          where: { id: evidence.employeeId },
          select: { userId: true },
        });
        if (!ownerEmployee) {
          // Defense-in-depth: an evidence row references an
          // employee that no longer exists. CASCADE-on-delete makes
          // this unreachable in practice; if we hit it, fail closed.
          throw new NotFoundException({
            error: 'not_found',
            message: 'Owning employee record not found',
          });
        }
        const actorEmployee = await tx.employee.findFirst({
          where: {
            userId: actor.user_id,
            organizationId: actor.organization_id,
            deactivatedAt: null,
          },
          select: { id: true },
        });
        const subjectAssignments = await tx.employeeAssignment.findMany({
          where: { employeeId: evidence.employeeId, deactivatedAt: null },
          select: { managerEmployeeId: true, deactivatedAt: true },
        });

        const authz = authorizeEvidenceView({
          actor: { user_id: actor.user_id, role: actor.role },
          ownerEmployee,
          actorEmployee,
          subjectAssignments,
        });
        if (!authz.allowed) {
          throw new ForbiddenException({
            error: 'forbidden',
            message: authz.reason,
          });
        }

        const { eventId } = await emitEvidenceRetrieved(
          tx,
          actor.organization_id,
          actor,
          {
            evidenceId: evidence.id,
            employeeId: evidence.employeeId,
            requirementId: evidence.requirementId,
          },
        );

        return {
          key: evidence.storageObjectKey,
          viaContext: authz.via,
          auditEventId: eventId,
        };
      },
    );

    let presigned;
    try {
      presigned = await this.storage.presignGet({ key, ttlSeconds });
    } catch (err) {
      if (err instanceof EvidenceStorageNotConfiguredError) {
        throw new ServiceUnavailableException({
          error: 'service_unavailable',
          message: 'Evidence storage is not configured on this deployment',
        });
      }
      // Include auditEventId so a forensic reader can correlate the
      // orphan audit row with the upstream failure. (Storage failure
      // is rare but not unreachable — S3 outages happen.)
      this.logger.error(
        `presignGet failed for ${key} (auditEventId=${auditEventId}): ${(err as Error).message}`,
      );
      throw err;
    }

    this.logger.log(
      `evidence ${evidenceId} download URL issued via=${viaContext} actor=${actor.user_id} auditEventId=${auditEventId}`,
    );

    return {
      downloadUrl: presigned.url,
      expiresAt: presigned.expiresAt.toISOString(),
    };
  }
}
