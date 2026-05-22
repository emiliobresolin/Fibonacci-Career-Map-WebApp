-- Story 6-2: Configuration domain tables (Arch §6.2, PRD §8).
--
-- Five org-scoped tables defining the configurable career model:
--   career_tracks     (PRD §8.1)
--   levels            (PRD §8.2) — non-overlapping score bands per track
--   layers            (PRD §8.3)
--   requirements      (PRD §8.4)
--   promotion_rules   (PRD §8.5) — exactly one per level
--
-- All five tables:
--   • carry organization_id NOT NULL (FK organizations, CASCADE on delete)
--   • get the Story 2-6 RLS sweep (ENABLE + FORCE + tenant_isolation_<table>)
--   • are operated on through the configuration module's repositories with
--     `withOrgScope(prisma, orgId, fn)` (apps/api/src/configuration/*)
--
-- The non-overlap invariant on `levels.score_band_start..score_band_end` is
-- enforced at the DB layer via a GiST EXCLUDE constraint. This requires
-- `btree_gist` so the UUID equality on `career_track_id` can participate in
-- a GiST index. btree_gist has been "trusted" since PostgreSQL 13, so an
-- ordinary user with CREATE privilege on the database can install it; the
-- IF NOT EXISTS clause makes the migration idempotent across re-runs and
-- across environments where a DBA has pre-provisioned the extension.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── career_tracks ─────────────────────────────────────────────────────────

CREATE TABLE "career_tracks" (
    "id"               UUID NOT NULL,
    "organization_id"  UUID NOT NULL,
    "slug"             TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "description"      TEXT,
    "display_order"    INTEGER NOT NULL DEFAULT 0,
    "active"           BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "career_tracks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "career_tracks_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

-- Slug shape mirrors the org-slug regex (apps/api/src/organizations/...) —
-- 2..63 lowercase alphanumerics or hyphens, no leading/trailing hyphen.
-- A track slug is operator-facing in the configuration UI; constraining it
-- at the DB layer keeps the validation invariant across the inevitable
-- bulk-import paths that bypass the service layer.
ALTER TABLE "career_tracks"
    ADD CONSTRAINT "career_tracks_slug_check"
    CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$');

CREATE UNIQUE INDEX "career_tracks_org_slug_unique"
    ON "career_tracks"("organization_id", "slug");
CREATE INDEX "career_tracks_organization_id_idx"
    ON "career_tracks"("organization_id");

ALTER TABLE "career_tracks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "career_tracks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_career_tracks" ON "career_tracks"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

-- ─── levels ────────────────────────────────────────────────────────────────

CREATE TABLE "levels" (
    "id"                  UUID NOT NULL,
    "organization_id"     UUID NOT NULL,
    "career_track_id"     UUID NOT NULL,
    "level_code"          TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    "score_band_start"    INTEGER NOT NULL,
    "score_band_end"      INTEGER NOT NULL,
    "display_order"       INTEGER NOT NULL DEFAULT 0,
    "active"              BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "levels_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "levels_career_track_id_fkey"
        FOREIGN KEY ("career_track_id") REFERENCES "career_tracks"("id") ON DELETE CASCADE,
    -- Band sanity. PRD §8.2: "band boundaries must be non-negative integers".
    -- We also require start < end so the int4range constructor never gets
    -- an empty range (which would silently bypass the EXCLUDE check).
    CONSTRAINT "levels_score_band_start_nonneg" CHECK ("score_band_start" >= 0),
    CONSTRAINT "levels_score_band_order" CHECK ("score_band_end" > "score_band_start")
);

CREATE UNIQUE INDEX "levels_track_code_unique"
    ON "levels"("career_track_id", "level_code");
CREATE INDEX "levels_organization_id_idx" ON "levels"("organization_id");
CREATE INDEX "levels_career_track_id_idx" ON "levels"("career_track_id");

-- AC1: non-overlapping band exclusion constraint, per Arch §6.2 + PRD §8.2.
-- The predicate `int4range(start, end, '[]') && int4range(...)` flags any
-- two ACTIVE levels in the same track whose inclusive bands overlap. We
-- restrict the constraint to `active = true` so deactivating a level
-- doesn't force its band to vanish from the table — a deactivated level
-- can keep its bounds for historical scoring lookups while a new active
-- level reuses those bounds.
ALTER TABLE "levels"
    ADD CONSTRAINT "levels_band_non_overlap"
    EXCLUDE USING GIST (
        "career_track_id" WITH =,
        int4range("score_band_start", "score_band_end", '[]') WITH &&
    ) WHERE ("active" = true);

ALTER TABLE "levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "levels" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_levels" ON "levels"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

-- ─── layers ────────────────────────────────────────────────────────────────

CREATE TABLE "layers" (
    "id"              UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "level_id"        UUID NOT NULL,
    "name"            TEXT NOT NULL,
    "display_order"   INTEGER NOT NULL DEFAULT 0,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "layers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "layers_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "layers_level_id_fkey"
        FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE,
    -- Layer names are operator-typed; trim is a service-layer concern but
    -- empties are flatly disallowed at the DB level so the UI can't store
    -- a row that the configuration list would render as a blank line.
    CONSTRAINT "layers_name_not_empty" CHECK (char_length("name") > 0)
);

CREATE UNIQUE INDEX "layers_level_name_unique"
    ON "layers"("level_id", "name");
CREATE INDEX "layers_organization_id_idx" ON "layers"("organization_id");
CREATE INDEX "layers_level_id_idx" ON "layers"("level_id");

ALTER TABLE "layers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "layers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_layers" ON "layers"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

-- ─── requirements ──────────────────────────────────────────────────────────

CREATE TYPE "EvidenceType" AS ENUM ('FILE', 'URL', 'TEXT', 'STRUCTURED');

CREATE TABLE "requirements" (
    "id"              UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "layer_id"        UUID NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "evidence_type"   "EvidenceType" NOT NULL,
    "weight"          INTEGER NOT NULL,
    "mandatory"       BOOLEAN NOT NULL DEFAULT FALSE,
    "expiry_months"   INTEGER,
    "active"          BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "requirements_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "requirements_layer_id_fkey"
        FOREIGN KEY ("layer_id") REFERENCES "layers"("id") ON DELETE CASCADE,
    CONSTRAINT "requirements_weight_positive" CHECK ("weight" > 0),
    -- expiry_months nullable but POSITIVE when set — 0 months is an
    -- immediate-expiry footgun, and negative months is nonsensical.
    CONSTRAINT "requirements_expiry_months_positive"
        CHECK ("expiry_months" IS NULL OR "expiry_months" > 0),
    CONSTRAINT "requirements_name_not_empty" CHECK (char_length("name") > 0)
);

CREATE INDEX "requirements_organization_id_idx" ON "requirements"("organization_id");
CREATE INDEX "requirements_layer_id_idx" ON "requirements"("layer_id");

ALTER TABLE "requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "requirements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_requirements" ON "requirements"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

-- ─── promotion_rules ───────────────────────────────────────────────────────

CREATE TABLE "promotion_rules" (
    "id"                          UUID NOT NULL,
    "organization_id"             UUID NOT NULL,
    "level_id"                    UUID NOT NULL,
    "min_score"                   INTEGER NOT NULL,
    "min_time_at_level_months"    INTEGER,
    "mandatory_completion"        BOOLEAN NOT NULL DEFAULT TRUE,
    "manager_required"            BOOLEAN NOT NULL DEFAULT TRUE,
    "hr_required"                 BOOLEAN NOT NULL DEFAULT FALSE,
    "blocker_check"               BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "promotion_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "promotion_rules_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "promotion_rules_level_id_fkey"
        FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE,
    CONSTRAINT "promotion_rules_min_score_nonneg" CHECK ("min_score" >= 0),
    CONSTRAINT "promotion_rules_min_time_nonneg"
        CHECK ("min_time_at_level_months" IS NULL OR "min_time_at_level_months" >= 0)
);

-- Exactly one rule per level (PRD §8.5 "per level"). Without this,
-- two concurrent edits could land two rows pointing at the same level
-- and the evaluator would have to disambiguate at read time.
CREATE UNIQUE INDEX "promotion_rules_level_id_unique"
    ON "promotion_rules"("level_id");
CREATE INDEX "promotion_rules_organization_id_idx" ON "promotion_rules"("organization_id");

ALTER TABLE "promotion_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promotion_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_promotion_rules" ON "promotion_rules"
    USING ("organization_id" = current_setting('app.current_org_id', true)::uuid)
    WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
