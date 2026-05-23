import { Module } from '@nestjs/common';

import { CareerTracksController } from './career-tracks.controller.js';
import { CareerTracksRepository } from './career-tracks.repository.js';
import { CareerTracksService } from './career-tracks.service.js';
import { LayersController } from './layers.controller.js';
import { LayersRepository } from './layers.repository.js';
import { LayersService } from './layers.service.js';
import { ApprovalWorkflowController } from './approval-workflow.controller.js';
import { ChangeImpactController } from './change-impact.controller.js';
import { ChangeImpactService } from './change-impact.service.js';
import { OrgSettingsController } from './org-settings.controller.js';
import { OrgSettingsService } from './org-settings.service.js';
import { LevelsController } from './levels.controller.js';
import { LevelsRepository } from './levels.repository.js';
import { LevelsService } from './levels.service.js';
import { PromotionRulesController } from './promotion-rules.controller.js';
import { PromotionRulesRepository } from './promotion-rules.repository.js';
import { PromotionRulesService } from './promotion-rules.service.js';
import { RequirementsController } from './requirements.controller.js';
import { RequirementsRepository } from './requirements.repository.js';
import { RequirementsService } from './requirements.service.js';

/**
 * Configuration module (Story 6-2 + 7-1, Arch §6.2, PRD §8).
 *
 * Owns the five configuration tables (career_tracks / levels /
 * layers / requirements / promotion_rules). Every reader and
 * writer of these tables goes through one of the exported
 * repositories — direct PrismaService access from outside this
 * module is the kind of cross-module shortcut that Arch §5.1's
 * modular-monolith boundary forbids.
 *
 * Surfaces wired here:
 *   • 7-1: GET/POST/PATCH/DELETE /v1/career-tracks (CareerTracksController)
 *   — service layer wraps the repository to co-commit configuration.changed
 *   outbox emission with the row write.
 *
 * Future stories (7-2 → 7-5) add the equivalent CRUD surfaces for
 * levels / layers / requirements / promotion_rules.
 */
@Module({
  controllers: [
    CareerTracksController,
    LevelsController,
    LayersController,
    RequirementsController,
    PromotionRulesController,
    OrgSettingsController,
    ApprovalWorkflowController,
    ChangeImpactController,
  ],
  providers: [
    CareerTracksRepository,
    CareerTracksService,
    LevelsRepository,
    LevelsService,
    LayersRepository,
    LayersService,
    RequirementsRepository,
    RequirementsService,
    PromotionRulesRepository,
    PromotionRulesService,
    OrgSettingsService,
    ChangeImpactService,
  ],
  exports: [
    CareerTracksRepository,
    CareerTracksService,
    LevelsRepository,
    LevelsService,
    LayersRepository,
    LayersService,
    RequirementsRepository,
    RequirementsService,
    PromotionRulesRepository,
    PromotionRulesService,
    OrgSettingsService,
    ChangeImpactService,
  ],
})
export class ConfigurationModule {}
