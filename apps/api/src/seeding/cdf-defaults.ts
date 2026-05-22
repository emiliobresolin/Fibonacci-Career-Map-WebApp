import { EvidenceType } from '@prisma/client';

/**
 * Common Default Framework (CDF) seed data for new orgs (Story 6-3,
 * PRD §6.1 + §7.3 + §8). Every value here is operator-tunable
 * post-seed; this module just defines what a fresh org gets on day
 * one so admins can see employees on the map within the bootstrap
 * workflow.
 *
 * IMPORTANT — band layout: PRD §7.3 prints band ranges as "0–50",
 * "50–100", etc. (overlapping shared boundary). Our schema's EXCLUDE
 * constraint treats `int4range(start, end, '[]')` as inclusive on
 * both ends, so 50 in BOTH L1 and L2 would trip the constraint at
 * seed time. We therefore encode the bands as non-overlapping
 * half-step ranges: L1 = [0, 49], L2 = [50, 99], etc. The displayed
 * boundary in operator UIs reads as the inclusive max (49, 99, …);
 * an Epic-7 settings UI can display them either way.
 *
 * Note on PRD §8.5's "default: level band end value" for promotion
 * rule minScore: the seeder sets `minScore = scoreBandEnd` (49, 99,
 * 149, …). PRD §7.3's display column "L1: 0–50" implies the
 * operator-visible boundary at 50, but in our non-overlapping encoding
 * 50 belongs to L2. The promotion-rule defaults therefore reflect
 * "you've earned every point in your band" semantics — an employee
 * with score 49 is eligible for L1's promotion rule. If an Epic-7
 * settings UI re-renders bands as "0–50 / 51–100 / …", the displayed
 * threshold for promotion equals the encoded scoreBandEnd. Operators
 * who want the PRD-displayed semantics ("you must exceed the displayed
 * end") tune minScore to scoreBandEnd + 1 post-seed.
 *
 * The Fibonacci weights used for representative requirements are
 * intentionally NOT the full sequence (1, 2, 3, 5, 8, 13, 21) — the
 * seed only needs three weights, one per default layer. Operators
 * tune from there.
 */

export type CdfTrackSpec = {
  slug: string;
  name: string;
  description: string;
  displayOrder: number;
};

export type CdfLevelSpec = {
  levelCode: string;
  name: string;
  scoreBandStart: number;
  scoreBandEnd: number;
  displayOrder: number;
};

export type CdfLayerSpec = {
  name: string;
  displayOrder: number;
  /** Fibonacci weight assigned to the representative requirement
   *  this layer seeds. Capability is foundational (weight 1),
   *  Delivery is mid-tier (5), Influence is high-leverage (13). */
  requirementWeight: number;
  /** Default name pattern for the requirement seeded in this layer. */
  requirementName: string;
  requirementDescription: string;
  requirementEvidenceType: EvidenceType;
};

export const CDF_TRACKS: readonly CdfTrackSpec[] = [
  {
    slug: 'software-engineering',
    name: 'Software Engineering',
    description: 'Individual contributor career path for engineers.',
    displayOrder: 0,
  },
  {
    slug: 'architecture',
    name: 'Architecture',
    description: 'Senior IC track focused on cross-system design and technical leadership.',
    displayOrder: 1,
  },
  {
    slug: 'management',
    name: 'Management',
    description: 'People-leadership track focused on team delivery and growth.',
    displayOrder: 2,
  },
] as const;

/** Map from track slug to its level set. Bands are encoded as
 *  non-overlapping inclusive ranges. */
export const CDF_LEVELS: Record<string, readonly CdfLevelSpec[]> = {
  'software-engineering': [
    { levelCode: 'L1', name: 'Engineer I', scoreBandStart: 0, scoreBandEnd: 49, displayOrder: 0 },
    { levelCode: 'L2', name: 'Engineer II', scoreBandStart: 50, scoreBandEnd: 99, displayOrder: 1 },
    { levelCode: 'L3', name: 'Senior Engineer', scoreBandStart: 100, scoreBandEnd: 149, displayOrder: 2 },
    { levelCode: 'L4', name: 'Staff Engineer', scoreBandStart: 150, scoreBandEnd: 199, displayOrder: 3 },
    { levelCode: 'L5', name: 'Principal Engineer', scoreBandStart: 200, scoreBandEnd: 249, displayOrder: 4 },
  ],
  architecture: [
    { levelCode: 'L4', name: 'Architect', scoreBandStart: 150, scoreBandEnd: 199, displayOrder: 0 },
    { levelCode: 'L5', name: 'Principal Architect', scoreBandStart: 200, scoreBandEnd: 249, displayOrder: 1 },
  ],
  management: [
    { levelCode: 'L3', name: 'Engineering Manager', scoreBandStart: 100, scoreBandEnd: 149, displayOrder: 0 },
    { levelCode: 'L4', name: 'Senior Engineering Manager', scoreBandStart: 150, scoreBandEnd: 199, displayOrder: 1 },
    { levelCode: 'L5', name: 'Director of Engineering', scoreBandStart: 200, scoreBandEnd: 249, displayOrder: 2 },
  ],
} as const;

/** Default layers per level (PRD §8.3). Order matters for display. */
export const CDF_LAYERS: readonly CdfLayerSpec[] = [
  {
    name: 'Capability',
    displayOrder: 0,
    requirementWeight: 1,
    requirementName: 'Demonstrate Capability',
    requirementDescription:
      'Evidence of technical or domain capability at the required depth for this level.',
    requirementEvidenceType: 'TEXT',
  },
  {
    name: 'Delivery',
    displayOrder: 1,
    requirementWeight: 5,
    requirementName: 'Demonstrate Delivery',
    requirementDescription:
      'Evidence of consistent delivery on commitments scoped to this level.',
    requirementEvidenceType: 'TEXT',
  },
  {
    name: 'Influence',
    displayOrder: 2,
    requirementWeight: 13,
    requirementName: 'Demonstrate Influence',
    requirementDescription:
      'Evidence of cross-team / cross-function influence appropriate to this level.',
    requirementEvidenceType: 'TEXT',
  },
] as const;

/** Total expected counts for a freshly-seeded org. Pinned by the
 *  seeding-service test to detect drift from the PRD §6.1 spec. */
export const CDF_EXPECTED_COUNTS = {
  tracks: 3,
  // SE L1-L5 (5) + ARCH L4-L5 (2) + MGMT L3-L5 (3) = 10
  levels: 10,
  // 10 levels × 3 layers
  layers: 30,
  // 30 layers × 1 representative requirement each
  requirements: 30,
  // One promotion rule per level
  promotionRules: 10,
} as const;
