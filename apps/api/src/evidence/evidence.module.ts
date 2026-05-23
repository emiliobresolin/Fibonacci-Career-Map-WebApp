import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AwsS3EvidenceStorage } from './aws-s3-evidence-storage.js';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceDownloadController } from './evidence-download.controller.js';
import { EvidenceDownloadService } from './evidence-download.service.js';
import { EvidenceFinalizeService } from './evidence-finalize.service.js';
import { EvidenceReviewController } from './evidence-review.controller.js';
import { EvidenceReviewService } from './evidence-review.service.js';
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
  // Re-import the scoring.recalc-employee queue so EvidenceReviewService
  // can @InjectQueue it. Same pattern as OutboxModule re-importing
  // audit.outbox-relay — JobsModule already registered the queue with
  // BullModule.registerQueueAsync; this widens the DI scope into the
  // evidence module without opening a second ioredis connection.
  imports: [BullModule.registerQueue({ name: 'scoring.recalc-employee' })],
  controllers: [EvidenceController, EvidenceDownloadController, EvidenceReviewController],
  providers: [
    EvidenceUploadService,
    EvidenceFinalizeService,
    EvidenceDownloadService,
    EvidenceReviewService,
    { provide: EVIDENCE_STORAGE, useClass: AwsS3EvidenceStorage },
  ],
  exports: [
    EvidenceUploadService,
    EvidenceFinalizeService,
    EvidenceDownloadService,
    EvidenceReviewService,
    EVIDENCE_STORAGE,
  ],
})
export class EvidenceModule {}
