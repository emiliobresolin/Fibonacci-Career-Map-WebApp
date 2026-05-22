import { Module } from '@nestjs/common';

import { CareerTracksRepository } from './career-tracks.repository.js';
import { LayersRepository } from './layers.repository.js';
import { LevelsRepository } from './levels.repository.js';
import { PromotionRulesRepository } from './promotion-rules.repository.js';
import { RequirementsRepository } from './requirements.repository.js';

/**
 * Configuration module (Story 6-2, Arch §6.2, PRD §8).
 *
 * Owns the five configuration tables (career_tracks / levels /
 * layers / requirements / promotion_rules). AC3: every reader and
 * writer of these tables goes through one of the exported
 * repositories — direct PrismaService access from outside this
 * module is the kind of cross-module shortcut that Arch §5.1's
 * modular-monolith boundary forbids.
 *
 * Epic 7 CRUD endpoints + Epic 9 scoring + Epic 10 map projection
 * will inject these repos rather than the PrismaService for
 * configuration reads.
 */
@Module({
  providers: [
    CareerTracksRepository,
    LevelsRepository,
    LayersRepository,
    RequirementsRepository,
    PromotionRulesRepository,
  ],
  exports: [
    CareerTracksRepository,
    LevelsRepository,
    LayersRepository,
    RequirementsRepository,
    PromotionRulesRepository,
  ],
})
export class ConfigurationModule {}
