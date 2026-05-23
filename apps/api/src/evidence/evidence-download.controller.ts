import { Controller, Get, Header, Inject, Param } from '@nestjs/common';

import {
  ActorContext,
  type ActorContext as ActorContextType,
} from '../auth/actor-context.js';
import {
  EvidenceDownloadService,
  type CreateDownloadUrlResult,
} from './evidence-download.service.js';

/**
 * Story 8-3 — pre-signed evidence-download endpoint.
 *
 * Route: `GET /v1/evidence/:id/download`
 *
 * Mounted under `v1/evidence` (not under the requirement path) because
 * an evidence id uniquely identifies the row across requirements. The
 * service runs RBAC + visibility gating before issuing the presigned
 * GET URL.
 *
 * No `@Roles` guard at the controller — the authorization decision is
 * row-specific (owner / direct manager / ADMIN) and lives in
 * {@link EvidenceDownloadService}. A blanket role gate here would
 * either over-restrict (MANAGER-only would block owners) or
 * under-restrict (any-authenticated would skip the manager-edge
 * check) — neither is right.
 */
@Controller('v1/evidence')
export class EvidenceDownloadController {
  constructor(
    @Inject(EvidenceDownloadService)
    private readonly service: EvidenceDownloadService,
  ) {}

  // The response body carries a presigned URL. Forbid intermediate
  // caches (CDN, browser cache, corporate proxy) from re-serving it
  // to another viewer within its 10-min TTL. Defense-in-depth — the
  // URL is already tied to the actor's authorization decision, but a
  // mis-configured proxy could surface it across users without this
  // header.
  @Get(':id/download')
  @Header('Cache-Control', 'no-store')
  async download(
    @ActorContext() actor: ActorContextType,
    @Param('id') id: string,
  ): Promise<CreateDownloadUrlResult> {
    return this.service.createDownloadUrl(actor, id);
  }
}
