-- Story 2-1: Identity schema baseline.
-- Drops the Story 1-4 placeholder and creates the three identity tables
-- plus the four enums consumed by the rest of EPIC-2 onwards.
--
-- This migration is hand-written for the same reason 1-4 was: no live local
-- Postgres yet, so `prisma migrate dev` cannot synthesize the SQL. After this
-- story, EPIC-2 onwards uses `prisma migrate dev --name <slug>` exclusively.

-- ─── Drop Story 1-4 placeholder ──────────────────────────────────────────────
DROP TABLE IF EXISTS "_MigrationProbe";

-- ─── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'MANAGER', 'ADMIN');

CREATE TYPE "PromotionMode" AS ENUM ('CALIBRATION', 'ACTIVE');

CREATE TYPE "VisibilityDefault" AS ENUM ('OWN_ONLY', 'TEAM', 'ORG_SUMMARY', 'ORG_FULL');

CREATE TYPE "ApprovalWorkflow" AS ENUM ('SINGLE', 'DUAL_MANAGER', 'HR_GATE');

-- ─── organizations ──────────────────────────────────────────────────────────
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "oidc_config" JSONB,
    "visibility_default" "VisibilityDefault" NOT NULL DEFAULT 'OWN_ONLY',
    "approval_workflow_default" "ApprovalWorkflow" NOT NULL DEFAULT 'SINGLE',
    "promotion_mode" "PromotionMode" NOT NULL DEFAULT 'CALIBRATION',
    "promotion_mode_changed_at" TIMESTAMPTZ,
    "promotion_mode_changed_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" ("slug");

-- ─── users ──────────────────────────────────────────────────────────────────
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — email unique within org so multi-tenant installations can have
-- the same person at two orgs. Global email uniqueness lands in a future cross-
-- org-identity story if needed.
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users" ("organization_id", "email");

-- CreateIndex (AC2 — organization_id is the tenant-scope key, hot for RLS)
CREATE INDEX "users_organization_id_idx" ON "users" ("organization_id");

-- AddForeignKey
ALTER TABLE "users"
    ADD CONSTRAINT "users_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─── role_assignments ──────────────────────────────────────────────────────
CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- AC1: composite unique on (user_id, organization_id, role) — PARTIAL, so a
-- new active grant can coexist with prior soft-deactivated rows. PRD §4.2's
-- "exactly one role per (user, org)" carve-out for Admin+Employee is enforced
-- by allowing two distinct (user_id, org_id, role) tuples sharing the same
-- (user_id, org_id) prefix. Soft-deactivation (deactivated_at) preserves the
-- audit trail across role rotations (Story 2-1 review F1).
CREATE UNIQUE INDEX "role_assignments_user_id_organization_id_role_key"
    ON "role_assignments" ("user_id", "organization_id", "role")
    WHERE "deactivated_at" IS NULL;

-- CreateIndex (AC2)
CREATE INDEX "role_assignments_organization_id_idx" ON "role_assignments" ("organization_id");
CREATE INDEX "role_assignments_user_id_idx" ON "role_assignments" ("user_id");
CREATE INDEX "role_assignments_deactivated_at_idx" ON "role_assignments" ("deactivated_at");

-- AddForeignKey
ALTER TABLE "role_assignments"
    ADD CONSTRAINT "role_assignments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "role_assignments"
    ADD CONSTRAINT "role_assignments_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
