# Story 6.2: Configuration tables: tracks, levels, layers, requirements, promotion_rules

Status: done (live-DB EXCLUDE-constraint integration test deferred to DATABASE_URL-gated suite)

## Story

As an engineer,
I want the configuration schema as data (not code),
so that every dimension in PRD §8 is org-editable.

## Acceptance Criteria

1. Migrations create `career_tracks`, `levels` (with non-overlapping band exclusion constraint), `layers`, `requirements`, `promotion_rules` per Arch §6.2.
2. All tables are `organization_id`-scoped with RLS.
3. A repository per table exists in the `configuration` module; no direct DB access outside it.

## Tasks / Subtasks

- [x] Task covering AC #1 — migration `20260528000000_configuration_tables/migration.sql` creates `career_tracks`, `levels`, `layers`, `requirements`, `promotion_rules` with FK CASCADE to `organizations` (and to each other where the parent table is in the same migration). The non-overlapping band exclusion constraint on `levels` is `EXCLUDE USING GIST (career_track_id WITH =, int4range(score_band_start, score_band_end, '[]') WITH &&) WHERE (active = true)` — powered by `CREATE EXTENSION IF NOT EXISTS btree_gist` so UUID equality can participate in the GiST index. Bands are inclusive on both ends; the strict `score_band_end > score_band_start` CHECK guarantees the range constructor never sees an empty range that would silently bypass overlap detection. Deactivated levels are excluded from the EXCLUDE scope so their bands can be reused by new active levels.
- [x] Task covering AC #2 — every table in the migration gets the Story-2-6 RLS sweep: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `ALTER TABLE ... FORCE ROW LEVEL SECURITY`, `CREATE POLICY "tenant_isolation_<table>" ON <table> USING (organization_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (...)`. The closed-fail semantics (missing GUC → NULL comparison → row excluded) match the canonical Story 2-6 pattern; the migration-shape test pins the predicate so a future refactor can't silently drop the `, true` arg and flip the policy to fail-open.
- [x] Task covering AC #3 — `apps/api/src/configuration/` exports a repository per table (`CareerTracksRepository`, `LevelsRepository`, `LayersRepository`, `RequirementsRepository`, `PromotionRulesRepository`); every read/write wraps `withOrgScope(prisma, orgId, fn)`. The `ConfigurationModule` exports all five repos so Epic 7 CRUD, Epic 9 scoring, and Epic 10 map projection can inject them — direct PrismaService access from outside this module is forbidden by the modular-monolith boundary (Arch §5.1).

## Dev Notes

- Architecture patterns and constraints to follow are captured in the References block below; the dev agent must read those sections before implementing.
- Respect the modular-monolith boundaries in Arch §5.1 and the transactional-boundary rules in Arch §5.4.
- Any DB write that must be externally observable MUST go through the transactional outbox (Epic 3).

### Dependencies

- E2.6
- E6.1

### References

- Arch §5.1, §6.2
- PRD §8
- [Source: planning-artifacts/stories.md — index entry for this story]

### Deferred to follow-up

- **Live-DB EXCLUDE-constraint integration test.** The migration-shape test pins the SQL form of `EXCLUDE USING GIST (...)` but does not run a real Postgres to assert that two ACTIVE overlapping bands actually error out. Belongs in the `DATABASE_URL`-gated integration suite alongside `rls-integration.test.mjs`. Same posture as Story 6-1's AC4 gap.
- **Story 7-9 audit emission for configuration changes.** The repositories are bare data-access primitives; the `configuration.changed` outbox emission lives in the Epic-7 CRUD service layer that wraps these repos. Pin this in Story 7-9's AC so a config write can't accidentally ship through the repo without an audit row.
- **Production DELETE-path safety.** All five tables FK CASCADE on delete. Today there are no DELETE endpoints; when Epic 7 ships them, the recommendation is soft-delete (`active = false`) at the service layer rather than exposing a hard DELETE — but that's a service-layer policy decision, not a schema one.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m])

### Debug Log References

- `pnpm --filter @fcm/api exec prisma generate` — green; client regenerated with the 5 new models + EvidenceType enum.
- `pnpm --filter @fcm/api run build` — green.
- `pnpm test` — 187 pass + 1 skip (api) + 43 pass (domain-contracts) = 231 tests. The 1 skip is the existing `DATABASE_URL`-gated RLS integration suite. (Wait — the totals are: api 188 incl. 1 skip + domain-contracts 43 + scoring-core 0 = 231 + 1 skip across workspaces. The new tests are 25 migration-shape + 13 repository = 38 net additions over the Story 6-1 baseline of 150.)
- Adversarial review (general-purpose subagent) — 0 BLOCKER, 0 HIGH; 2 non-blocking observations (pre-existing `rls.helpers.ts` doc nit, Story 7-9 cross-flag).

### Completion Notes List

- AC1: 5 tables created. Levels carry the non-overlap EXCLUDE constraint (GiST + btree_gist) plus `score_band_start >= 0` and `score_band_end > score_band_start` CHECKs so the range constructor never silently produces an empty range. Requirements carry `weight > 0` and `expiry_months > 0 OR NULL`. CareerTracks carries a slug-shape CHECK matching the Story 6-1 org-slug regex.
- AC2: every one of the 5 tables enables RLS + FORCE + a `tenant_isolation_<table>` policy on `current_setting('app.current_org_id', true)::uuid`. Migration-shape test (`configuration-migration-shape.test.mjs`) pins the predicate so a refactor that drops `, true` (which would convert closed-fail to throwing) breaks loudly in CI.
- AC3: 5 repositories shipped in `apps/api/src/configuration/`, every method wraps `withOrgScope(prisma, orgId, fn)`. Module exports all five for Epic 7+ consumers. Repository test verifies one withOrgScope invocation per call AND that the orgId binds into the `set_config(...)` parameter — so a regression that bypassed the helper would surface immediately.
- Domain-contracts package: no changes (no new audit-event variant — configuration mutations are auditable, but the emission lives in Epic 7's CRUD service layer per Story 7-9).

### File List

- `apps/api/prisma/schema.prisma` (modified) — added `EvidenceType` enum + 5 new models (`CareerTrack`, `Level`, `Layer`, `Requirement`, `PromotionRule`) with FK back-relations from `Organization`.
- `apps/api/prisma/migrations/20260528000000_configuration_tables/migration.sql` (new) — full migration: `CREATE EXTENSION btree_gist`, 5 tables, FK CASCADE, EXCLUDE constraint on levels, CHECK constraints (slug shape, score band order, weight > 0, expiry months > 0, non-empty names), `EvidenceType` enum, RLS sweep on all 5 tables.
- `apps/api/src/configuration/career-tracks.repository.ts` (new) — list / findById / findBySlug / create / update; all wrapped in `withOrgScope`.
- `apps/api/src/configuration/levels.repository.ts` (new) — listByTrack / findById / create / update.
- `apps/api/src/configuration/layers.repository.ts` (new) — listByLevel / findById / create / update.
- `apps/api/src/configuration/requirements.repository.ts` (new) — listByLayer / findById / create / update.
- `apps/api/src/configuration/promotion-rules.repository.ts` (new) — findByLevelId / findById / create / update.
- `apps/api/src/configuration/configuration.module.ts` (new) — registers + exports all five repositories.
- `apps/api/src/app.module.ts` (modified) — imports `ConfigurationModule`.
- `apps/api/test/configuration-migration-shape.test.mjs` (new) — 25 tests asserting the migration SQL has the named tables, organization_id NOT NULL, EXCLUDE constraint shape, CHECK constraints, RLS sweep with closed-fail predicate.
- `apps/api/test/configuration-repositories.test.mjs` (new) — 13 tests: repo method shape, `withOrgScope` wrapping with orgId binding, exclusion-constraint propagation faithful to Prisma's `PrismaClientUnknownRequestError` shape (SQLSTATE 23P01 is unknown to Prisma's P-code map), `RlsInvalidOrgIdError` for non-UUID input.

### Adversarial Review Outcomes

- EXCLUDE constraint correctness: `'[]'` inclusive bounds catch shared-endpoint overlaps; the strict `end > start` CHECK guarantees non-empty ranges; `WHERE (active = true)` lets deactivated levels keep their bounds; btree_gist is the right enabler for the UUID equality predicate.
- RLS pattern matches Story 2-6 exactly; closed-fail semantics preserved across all 5 tables.
- Test mock fidelity: `PrismaClientUnknownRequestError` (not `KnownRequestError`) is the correct shape for SQLSTATE 23P01 exclusion violations — Prisma only maps a known list of SQLSTATEs to `P2xxx`. Common gotcha avoided.
- 0 BLOCKER / 0 HIGH findings. 2 non-blocking: (a) pre-existing `rls.helpers.ts` doc nit (says "SET LOCAL" but emits `set_config(..., true)` which is the function-call equivalent — semantically identical, doc fix is a future cleanup); (b) Story 7-9 cross-flag for configuration-audit emission.
