-- Story 1-4: initial Prisma migration. Establishes the migration pipeline with a
-- single placeholder table (_MigrationProbe) that exists ONLY to validate the
-- `prisma migrate deploy` CI step. Real domain tables land in later epics; this
-- table is dropped by EPIC-2's identity schema migration when it lands.
--
-- Note: id is application-generated via Prisma's @default(uuid()) so no
-- CREATE EXTENSION privilege is required on the database role (managed Postgres
-- providers commonly gate pgcrypto behind a superuser-only grant).

-- CreateTable
CREATE TABLE "_MigrationProbe" (
    "id" UUID NOT NULL,
    "ran_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "_MigrationProbe_pkey" PRIMARY KEY ("id")
);
