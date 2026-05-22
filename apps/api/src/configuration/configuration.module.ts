import { Module } from '@nestjs/common';

import { CareerTracksController } from './career-tracks.controller.js';
import { CareerTracksRepository } from './career-tracks.repository.js';
import { CareerTracksService } from './career-tracks.service.js';
import { LayersRepository } from './layers.repository.js';
import { LevelsRepository } from './levels.repository.js';
import { PromotionRulesRepository } from './promotion-rules.repository.js';
import { RequirementsRepository } from './requirements.repository.js';

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
  controllers: [CareerTracksController],
  providers: [
    CareerTracksRepository,
    CareerTracksService,
    LevelsRepository,
    LayersRepository,
    RequirementsRepository,
    PromotionRulesRepository,
  ],
  exports: [
    CareerTracksRepository,
    CareerTracksService,
    LevelsRepository,
    LayersRepository,
    RequirementsRepository,
    PromotionRulesRepository,
  ],
})
export class ConfigurationModule {}
