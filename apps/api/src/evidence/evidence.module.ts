import { Module } from '@nestjs/common';

import { AwsS3EvidenceStorage } from './aws-s3-evidence-storage.js';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceFinalizeService } from './evidence-finalize.service.js';
import { EVIDENCE_STORAGE } from './evidence-storage.port.js';
import { EvidenceUploadService } from './evidence-upload.service.js';

/**
 * Evidence module (Stories 8-1, 8-2, ..., 8-8 — Arch §5.1, §9.1, §9.2).
 *
 * Owns the evidence table and its lifecycle surface:
 *   • 8-1 EvidenceStateMachine — pure transition gate.
 *   • 8-2 Upload-slot + finalize endpoints (this story).
 *   • 8-3..8-8 land approve / reject / expiry surfaces.
 *
 * The {@link EVIDENCE_STORAGE} token is bound to
 * {@link AwsS3EvidenceStorage} by default. Tests provide their own
 * binding via `Test.createTestingModule({...}).overrideProvider(EVIDENCE_STORAGE).useValue(fake)`,
 * or instantiate the service directly with a fake passed via the
 * constructor. The token-based provider lets the swap happen without
 * mocking the AWS SDK itself.
 */
@Module({
  controllers: [EvidenceController],
  providers: [
    EvidenceUploadService,
    EvidenceFinalizeService,
    { provide: EVIDENCE_STORAGE, useClass: AwsS3EvidenceStorage },
  ],
  exports: [EvidenceUploadService, EvidenceFinalizeService, EVIDENCE_STORAGE],
})
export class EvidenceModule {}
